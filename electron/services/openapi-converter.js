const SwaggerParser = require('@apidevtools/swagger-parser');
const path = require('path');

/**
 * OpenAPI Converter
 * Handles import from OpenAPI/Swagger specs (2.0 and 3.x) and export to OpenAPI 3.x
 */
class OpenApiConverter {
  /**
   * Import an OpenAPI/Swagger spec and convert to Nikode Collection
   * @param {string} specPath - Path to the OpenAPI spec file
   * @returns {Promise<object>} Nikode Collection object
   */
  async importFromOpenApi(specPath) {
    // Parse and validate the spec
    const api = await SwaggerParser.validate(specPath);

    // Extract collection name from info.title
    const name = api.info?.title || path.basename(specPath, path.extname(specPath));

    // Extract base URL from servers
    const baseUrl = this.extractBaseUrl(api);

    // Create environments with baseUrl
    const environments = [
      {
        id: 'env-default',
        name: 'default',
        variables: [
          { key: 'baseUrl', value: baseUrl, enabled: true }
        ]
      }
    ];

    // Convert operations to items grouped by tags
    const items = this.convertPathsToItems(api);

    return {
      name,
      version: api.info?.version || '1.0.0',
      environments,
      activeEnvironmentId: 'env-default',
      items
    };
  }

  /**
   * Export a Nikode Collection to OpenAPI 3.x spec
   * @param {object} collection - Nikode Collection object
   * @returns {object} OpenAPI 3.x spec object
   */
  exportToOpenApi(collection) {
    // Find baseUrl from active environment or first environment
    const activeEnv = collection.environments?.find(e => e.id === collection.activeEnvironmentId)
      || collection.environments?.[0];
    const baseUrl = activeEnv?.variables?.find(v => v.key === 'baseUrl')?.value || 'http://localhost:3000';

    const spec = {
      openapi: '3.0.3',
      info: {
        title: collection.name,
        version: collection.version || '1.0.0'
      },
      servers: [
        { url: baseUrl }
      ],
      paths: {},
      tags: []
    };

    // Collect all requests and group by tags
    const tagSet = new Set();
    this.collectPaths(collection.items, spec.paths, tagSet, null);

    // Add tags
    spec.tags = Array.from(tagSet).map(name => ({ name }));

    // Clean up empty tags array
    if (spec.tags.length === 0) {
      delete spec.tags;
    }

    return spec;
  }

  /**
   * Extract base URL from OpenAPI spec
   */
  extractBaseUrl(api) {
    // OpenAPI 3.x
    if (api.servers && api.servers.length > 0) {
      return api.servers[0].url || 'http://localhost:3000';
    }

    // Swagger 2.0
    if (api.host) {
      const scheme = api.schemes?.[0] || 'https';
      const basePath = api.basePath || '';
      return `${scheme}://${api.host}${basePath}`;
    }

    return 'http://localhost:3000';
  }

  /**
   * Convert OpenAPI paths to Nikode collection items
   */
  convertPathsToItems(api) {
    const tagMap = new Map(); // tag -> items
    const untaggedItems = [];

    for (const [pathStr, pathItem] of Object.entries(api.paths || {})) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const request = this.convertOperationToRequest(pathStr, method, operation, api);

        // Group by first tag, or put in root
        const tag = operation.tags?.[0];
        if (tag) {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, []);
          }
          tagMap.get(tag).push(request);
        } else {
          untaggedItems.push(request);
        }
      }
    }

    // Convert tag groups to folders
    const items = [];

    for (const [tag, requests] of tagMap) {
      items.push({
        id: `folder-${this.slugify(tag)}-${Date.now()}`,
        type: 'folder',
        name: tag,
        items: requests
      });
    }

    // Add untagged items at root level
    items.push(...untaggedItems);

    return items;
  }

  /**
   * Convert a single OpenAPI operation to a Nikode request
   */
  convertOperationToRequest(pathStr, method, operation, api) {
    const id = `req-${this.slugify(operation.operationId || pathStr)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = operation.summary || operation.operationId || `${method.toUpperCase()} ${pathStr}`;

    // Convert path params from {id} to {{id}}
    const url = '{{baseUrl}}' + pathStr.replace(/\{([^}]+)\}/g, '{{$1}}');

    // Extract parameters
    const params = [];
    const headers = [];
    const allParams = [...(operation.parameters || []), ...(api.paths?.[pathStr]?.parameters || [])];

    for (const param of allParams) {
      const entry = {
        key: param.name,
        value: param.example?.toString() || param.schema?.default?.toString() || '',
        enabled: param.required || false
      };

      if (param.in === 'query') {
        params.push(entry);
      } else if (param.in === 'header') {
        headers.push(entry);
      }
    }

    // Add User-Agent header
    headers.push({ key: 'User-Agent', value: 'Nikode/1.0', enabled: true });

    // Add empty row for editing
    if (params.length > 0) {
      params.push({ key: '', value: '', enabled: true });
    }
    headers.push({ key: '', value: '', enabled: true });

    // Handle request body
    const body = this.convertRequestBody(operation, api);

    return {
      id,
      type: 'request',
      name,
      method: method.toUpperCase(),
      url,
      params: params.length > 1 ? params : [],
      headers,
      body,
      scripts: { pre: '', post: '' },
      docs: operation.description || ''
    };
  }

  /**
   * Convert OpenAPI request body to Nikode body format
   */
  convertRequestBody(operation, api) {
    const requestBody = operation.requestBody;
    if (!requestBody) {
      return { type: 'none' };
    }

    const content = requestBody.content;
    if (!content) {
      return { type: 'none' };
    }

    // Check for JSON
    if (content['application/json']) {
      const schema = content['application/json'].schema;
      const example = content['application/json'].example
        || this.generateExampleFromSchema(schema, api);

      return {
        type: 'json',
        content: example ? JSON.stringify(example, null, 2) : '{}'
      };
    }

    // Check for form-data
    if (content['multipart/form-data']) {
      const schema = content['multipart/form-data'].schema;
      const entries = this.schemaToFormEntries(schema, api);
      return {
        type: 'form-data',
        entries
      };
    }

    // Check for x-www-form-urlencoded
    if (content['application/x-www-form-urlencoded']) {
      const schema = content['application/x-www-form-urlencoded'].schema;
      const entries = this.schemaToFormEntries(schema, api);
      return {
        type: 'x-www-form-urlencoded',
        entries
      };
    }

    // Default to raw
    return { type: 'raw', content: '' };
  }

  /**
   * Generate example value from schema
   */
  generateExampleFromSchema(schema, api, depth = 0) {
    if (!schema || depth > 5) return null;

    // Handle $ref
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/', '').split('/');
      let resolved = api;
      for (const part of refPath) {
        resolved = resolved?.[part];
      }
      return this.generateExampleFromSchema(resolved, api, depth + 1);
    }

    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case 'object': {
        const obj = {};
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
          obj[key] = this.generateExampleFromSchema(propSchema, api, depth + 1);
        }
        return obj;
      }
      case 'array':
        return [this.generateExampleFromSchema(schema.items, api, depth + 1)];
      case 'string':
        return schema.enum?.[0] || 'string';
      case 'integer':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      default:
        return null;
    }
  }

  /**
   * Convert schema properties to form entries
   */
  schemaToFormEntries(schema, api) {
    if (!schema || schema.type !== 'object') {
      return [{ key: '', value: '', enabled: true }];
    }

    const entries = [];
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      entries.push({
        key,
        value: propSchema.example?.toString() || propSchema.default?.toString() || '',
        enabled: required.has(key)
      });
    }

    entries.push({ key: '', value: '', enabled: true });
    return entries;
  }

  /**
   * Recursively collect paths from collection items
   */
  collectPaths(items, paths, tagSet, folderName) {
    for (const item of items || []) {
      if (item.type === 'folder') {
        // Use folder name as tag
        tagSet.add(item.name);
        this.collectPaths(item.items, paths, tagSet, item.name);
      } else if (item.type === 'request') {
        this.addRequestToPath(item, paths, folderName);
        if (folderName) {
          tagSet.add(folderName);
        }
      }
    }
  }

  /**
   * Convert a Nikode request to an OpenAPI path operation
   */
  addRequestToPath(request, paths, folderName) {
    // Extract path from URL
    let url = request.url || '/';

    // Remove {{baseUrl}} prefix
    url = url.replace(/^\{\{baseUrl\}\}/i, '');

    // Convert {{variable}} back to {variable}
    url = url.replace(/\{\{([^}]+)\}\}/g, '{$1}');

    // Ensure path starts with /
    if (!url.startsWith('/')) {
      url = '/' + url;
    }

    // Remove query string if present
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substring(0, queryIndex);
    }

    const method = (request.method || 'GET').toLowerCase();

    if (!paths[url]) {
      paths[url] = {};
    }

    const operation = {
      summary: request.name,
      operationId: this.slugify(request.name)
    };

    if (folderName) {
      operation.tags = [folderName];
    }

    if (request.docs) {
      operation.description = request.docs;
    }

    // Add parameters
    const parameters = [];

    // Path parameters
    const pathParams = url.match(/\{([^}]+)\}/g) || [];
    for (const param of pathParams) {
      const name = param.slice(1, -1);
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' }
      });
    }

    // Query parameters
    for (const param of request.params || []) {
      if (param.key) {
        parameters.push({
          name: param.key,
          in: 'query',
          required: false,
          schema: { type: 'string' },
          example: param.value || undefined
        });
      }
    }

    // Header parameters (excluding standard headers)
    const excludedHeaders = ['user-agent', 'content-type', 'accept', 'authorization'];
    for (const header of request.headers || []) {
      if (header.key && !excludedHeaders.includes(header.key.toLowerCase())) {
        parameters.push({
          name: header.key,
          in: 'header',
          required: false,
          schema: { type: 'string' },
          example: header.value || undefined
        });
      }
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    // Add request body
    if (request.body && request.body.type !== 'none') {
      operation.requestBody = this.convertNikodeBodyToOpenApi(request.body);
    }

    // Add default response
    operation.responses = {
      '200': {
        description: 'Successful response'
      }
    };

    paths[url][method] = operation;
  }

  /**
   * Convert Nikode body to OpenAPI requestBody
   */
  convertNikodeBodyToOpenApi(body) {
    switch (body.type) {
      case 'json':
        return {
          content: {
            'application/json': {
              schema: { type: 'object' },
              example: body.content ? this.tryParseJson(body.content) : {}
            }
          }
        };

      case 'form-data':
        return {
          content: {
            'multipart/form-data': {
              schema: this.entriesToSchema(body.entries)
            }
          }
        };

      case 'x-www-form-urlencoded':
        return {
          content: {
            'application/x-www-form-urlencoded': {
              schema: this.entriesToSchema(body.entries)
            }
          }
        };

      case 'raw':
        return {
          content: {
            'text/plain': {
              schema: { type: 'string' },
              example: body.content || ''
            }
          }
        };

      default:
        return undefined;
    }
  }

  /**
   * Convert form entries to OpenAPI schema
   */
  entriesToSchema(entries) {
    const properties = {};

    for (const entry of entries || []) {
      if (entry.key) {
        properties[entry.key] = {
          type: 'string',
          example: entry.value || undefined
        };
      }
    }

    return {
      type: 'object',
      properties
    };
  }

  /**
   * Try to parse JSON, return as-is if fails
   */
  tryParseJson(str) {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  /**
   * Convert string to slug
   */
  slugify(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}

module.exports = { OpenApiConverter };

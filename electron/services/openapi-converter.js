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
    // Parse and validate the spec (this dereferences $refs — schemas may become circular)
    const api = await SwaggerParser.validate(specPath);

    // Also get the raw, non-dereferenced spec so schemas keep their $ref strings
    // and remain serializable (dereferenced schemas form cycles when they cross-reference).
    const rawApi = await SwaggerParser.parse(specPath);

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

    // Extract security schemes once and pass into operation conversion
    const securitySchemes = this.extractSecuritySchemes(api);

    // Resolve the global security requirement (if any) into a Nikode auth template.
    // When present, hoist it to collection.auth and let child requests inherit.
    const collectionAuth = this.resolveOperationAuth({}, api, securitySchemes);

    // Convert operations to items grouped by tags. The collectionAuth is also
    // passed so operations inheriting the global default get `auth: { type: 'inherit' }`
    // rather than 70 copies of the same oauth2 config.
    const items = this.convertPathsToItems(api, securitySchemes, collectionAuth);

    // Extract component schemas from the raw spec to preserve $refs
    const schemas = this.extractSchemas(rawApi);

    const collection = {
      name,
      version: api.info?.version || '1.0.0',
      environments,
      activeEnvironmentId: 'env-default',
      items,
      ...(collectionAuth ? { auth: collectionAuth } : {})
    };

    return { collection, schemas };
  }

  /**
   * Extract schemas from OpenAPI components.schemas or Swagger 2.0 definitions
   * @returns {Array<{id: string, name: string, type: string, content: string}>}
   */
  extractSchemas(api) {
    const source = api.components?.schemas || api.definitions || {};
    const schemas = [];

    for (const [name, schema] of Object.entries(source)) {
      schemas.push({
        id: `schema-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        type: 'json',
        content: JSON.stringify(schema, null, 2)
      });
    }

    return schemas;
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

    // Collect all requests and group by tags. authRefs collects every auth
    // type referenced (collection-level + per-operation overrides) so we know
    // which scheme definitions to emit at the spec level.
    const tagSet = new Set();
    const authRefs = new Set();
    const collectionAuth = this.normalizeAuthForExport(collection.auth);

    // If the collection has a concrete auth, emit it as the global default —
    // operations whose effective auth matches will simply inherit and omit
    // per-op security; mismatches emit a per-op override.
    if (collectionAuth) {
      authRefs.add(collectionAuth.type);
      const schemeName = this.authTypeToSchemeName(collectionAuth.type);
      if (schemeName) {
        spec.security = [{ [schemeName]: [] }];
      }
    }

    this.collectPaths(collection.items, spec.paths, tagSet, null, authRefs, collectionAuth, []);

    // Add tags
    spec.tags = Array.from(tagSet).map(name => ({ name }));

    // Clean up empty tags array
    if (spec.tags.length === 0) {
      delete spec.tags;
    }

    // Emit components.securitySchemes for any auth types referenced
    if (authRefs.size > 0) {
      const securitySchemes = {};
      for (const authType of authRefs) {
        const [schemeName, schemeDef] = this.authTypeToSecurityScheme(authType);
        if (schemeName && schemeDef) {
          securitySchemes[schemeName] = schemeDef;
        }
      }
      if (Object.keys(securitySchemes).length > 0) {
        spec.components = { ...(spec.components || {}), securitySchemes };
      }
    }

    return spec;
  }

  /**
   * Treat 'inherit' or undefined or 'none' as "no concrete auth" for export
   * purposes — those don't have a corresponding security scheme to emit.
   */
  normalizeAuthForExport(auth) {
    if (!auth || auth.type === 'inherit' || auth.type === 'none') return null;
    return auth;
  }

  /**
   * Map a Nikode auth type to a (schemeName, schemeDefinition) pair for OpenAPI 3.x
   * components.securitySchemes. Used during export.
   */
  authTypeToSecurityScheme(authType) {
    switch (authType) {
      case 'bearer':
        return ['BearerAuth', { type: 'http', scheme: 'bearer' }];
      case 'basic':
        return ['BasicAuth', { type: 'http', scheme: 'basic' }];
      case 'api-key':
        return ['ApiKeyAuth', { type: 'apiKey', in: 'header', name: 'X-API-Key' }];
      case 'oauth2':
        return ['OAuth2', {
          type: 'oauth2',
          flows: {
            clientCredentials: { tokenUrl: '', scopes: {} }
          }
        }];
      default:
        return [null, null];
    }
  }

  /**
   * Map a Nikode auth type to its security scheme name for use in operation.security.
   */
  authTypeToSchemeName(authType) {
    return this.authTypeToSecurityScheme(authType)[0];
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
  convertPathsToItems(api, securitySchemes = {}, collectionAuth = null) {
    const tagMap = new Map(); // tag -> items
    const untaggedItems = [];

    for (const [pathStr, pathItem] of Object.entries(api.paths || {})) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const request = this.convertOperationToRequest(pathStr, method, operation, api, securitySchemes, collectionAuth);

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

    // Convert tag groups to folders. As we go, look for folder-level coalescing:
    // if every request in a tag has the same inline auth (and it differs from
    // collectionAuth), hoist that auth to the folder and switch its requests
    // to 'inherit'. Saves repeating the same oauth2 config on every endpoint
    // in an /admin tag, etc.
    const items = [];

    for (const [tag, requests] of tagMap) {
      const sharedAuth = this.findSharedInlineAuth(requests, collectionAuth);
      const folder = {
        id: `folder-${this.slugify(tag)}-${Date.now()}`,
        type: 'folder',
        name: tag,
        items: requests,
      };
      if (sharedAuth) {
        folder.auth = sharedAuth;
        for (const r of requests) {
          r.auth = { type: 'inherit' };
        }
      }
      items.push(folder);
    }

    // Add untagged items at root level
    items.push(...untaggedItems);

    return items;
  }

  /**
   * Returns the auth shared by every request in the list — but ONLY if it's a
   * concrete (non-inherit, non-none) inline auth and differs from the collection
   * default. Used by import-time folder coalescing.
   */
  findSharedInlineAuth(requests, collectionAuth) {
    if (requests.length < 2) return null; // single-request folders aren't worth coalescing
    const first = requests[0].auth;
    if (!first || first.type === 'inherit' || first.type === 'none') return null;

    for (let i = 1; i < requests.length; i++) {
      const a = requests[i].auth;
      if (!this.authsAreEquivalent(first, a)) return null;
    }
    // Don't hoist if it would just duplicate collection auth
    if (collectionAuth && this.authsAreEquivalent(first, collectionAuth)) return null;
    return first;
  }

  /**
   * Convert a single OpenAPI operation to a Nikode request
   */
  convertOperationToRequest(pathStr, method, operation, api, securitySchemes = {}, collectionAuth = null) {
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

    // Resolve auth from operation/global security. If the result matches the
    // collection-level auth (hoisted from api.security), emit `inherit` instead
    // of duplicating the config on every operation.
    const operationDefinedSecurity = operation.security !== undefined;
    const auth = this.resolveOperationAuth(operation, api, securitySchemes);

    const request = {
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

    if (auth) {
      // If operation didn't override security and collection already has the same
      // auth at its level, inherit. Otherwise embed inline.
      if (!operationDefinedSecurity && collectionAuth && this.authsAreEquivalent(auth, collectionAuth)) {
        request.auth = { type: 'inherit' };
      } else {
        request.auth = auth;
      }
    } else if (operationDefinedSecurity && Array.isArray(operation.security) && operation.security.length === 0) {
      // Operation explicitly disabled auth (security: []); persist as 'none' so
      // it does NOT inherit from the collection.
      request.auth = { type: 'none' };
    }

    return request;
  }

  /**
   * Shallow-equivalent check used to detect "operation auth matches collection auth"
   * during import. Compares type and the type-specific config block.
   */
  authsAreEquivalent(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'bearer':
      case 'basic':
      case 'api-key':
      case 'oauth2':
        return JSON.stringify(a[this.authConfigKey(a.type)]) === JSON.stringify(b[this.authConfigKey(b.type)]);
      default:
        return true;
    }
  }

  authConfigKey(type) {
    switch (type) {
      case 'api-key': return 'apiKey';
      case 'bearer': return 'bearer';
      case 'basic': return 'basic';
      case 'oauth2': return 'oauth2';
      default: return null;
    }
  }

  /**
   * Extract security schemes from an OpenAPI/Swagger spec into a map of
   * scheme name -> Nikode RequestAuth template.
   */
  extractSecuritySchemes(api) {
    const source = api.components?.securitySchemes || api.securityDefinitions || {};
    const result = {};

    for (const [name, scheme] of Object.entries(source)) {
      const auth = this.openApiSecuritySchemeToAuth(scheme);
      if (auth) {
        result[name] = auth;
      }
    }

    return result;
  }

  /**
   * Convert a single OpenAPI/Swagger security scheme to a Nikode RequestAuth.
   * Returns null for unsupported schemes (e.g. openIdConnect, mutualTLS).
   */
  openApiSecuritySchemeToAuth(scheme) {
    if (!scheme || !scheme.type) return null;
    const type = scheme.type;

    // OpenAPI 3.x: type=http with scheme=bearer/basic
    if (type === 'http') {
      const httpScheme = (scheme.scheme || '').toLowerCase();
      if (httpScheme === 'bearer') {
        return { type: 'bearer', bearer: { token: '', prefix: 'Bearer' } };
      }
      if (httpScheme === 'basic') {
        return { type: 'basic', basic: { username: '', password: '' } };
      }
      return null;
    }

    // Swagger 2.0: type=basic
    if (type === 'basic') {
      return { type: 'basic', basic: { username: '', password: '' } };
    }

    // OpenAPI 3.x and Swagger 2.0: type=apiKey
    if (type === 'apiKey') {
      const addTo = scheme.in === 'query' ? 'query' : 'header';
      return {
        type: 'api-key',
        apiKey: { key: scheme.name || '', value: '', addTo }
      };
    }

    // OpenAPI 3.x and Swagger 2.0: type=oauth2
    if (type === 'oauth2') {
      return this.oauth2SchemeToAuth(scheme);
    }

    return null;
  }

  /**
   * Build a Nikode oauth2 auth from an OpenAPI 3.x or Swagger 2.0 oauth2 scheme.
   * Picks the first available flow and prefers client_credentials > password > authorization_code.
   */
  oauth2SchemeToAuth(scheme) {
    let grantType = 'client_credentials';
    let tokenUrl = '';
    let authUrl = '';
    let scope = '';

    const flows = scheme.flows;
    if (flows) {
      // OpenAPI 3.x flows object
      if (flows.clientCredentials) {
        grantType = 'client_credentials';
        tokenUrl = flows.clientCredentials.tokenUrl || '';
        scope = Object.keys(flows.clientCredentials.scopes || {}).join(' ');
      } else if (flows.password) {
        grantType = 'password';
        tokenUrl = flows.password.tokenUrl || '';
        scope = Object.keys(flows.password.scopes || {}).join(' ');
      } else if (flows.authorizationCode) {
        grantType = 'authorization_code';
        tokenUrl = flows.authorizationCode.tokenUrl || '';
        authUrl = flows.authorizationCode.authorizationUrl || '';
        scope = Object.keys(flows.authorizationCode.scopes || {}).join(' ');
      }
    } else if (scheme.flow) {
      // Swagger 2.0 flow string: implicit | password | application | accessCode
      const swaggerFlow = scheme.flow;
      if (swaggerFlow === 'application') grantType = 'client_credentials';
      else if (swaggerFlow === 'password') grantType = 'password';
      else if (swaggerFlow === 'accessCode') grantType = 'authorization_code';
      tokenUrl = scheme.tokenUrl || '';
      authUrl = scheme.authorizationUrl || '';
      scope = Object.keys(scheme.scopes || {}).join(' ');
    }

    return {
      type: 'oauth2',
      oauth2: {
        grantType,
        accessToken: '',
        tokenUrl,
        authUrl,
        clientId: '',
        clientSecret: '',
        username: '',
        password: '',
        callbackUrl: '',
        scope,
        // Default PKCE on for authorization_code — required by public clients
        // (Keycloak, Auth0, Okta, etc. with no client secret) and harmless otherwise
        ...(grantType === 'authorization_code' ? { usePkce: true } : {})
      }
    };
  }

  /**
   * Resolve which security scheme applies to an operation and return a Nikode
   * RequestAuth, or null if the operation has no auth.
   *
   * Resolution rules (per OpenAPI):
   * - operation.security overrides api.security entirely
   * - operation.security = [] explicitly disables auth (even with global)
   * - security is an array of OR-options; each option is an AND-map of schemes
   *   We pick the first option's first scheme (Nikode supports a single auth per request).
   */
  resolveOperationAuth(operation, api, securitySchemes) {
    const security = operation.security !== undefined ? operation.security : api.security;
    if (!Array.isArray(security) || security.length === 0) return null;

    const requirement = security[0];
    if (!requirement || typeof requirement !== 'object') return null;

    const schemeName = Object.keys(requirement)[0];
    if (!schemeName) return null;

    const template = securitySchemes[schemeName];
    if (!template) return null;

    // Deep clone so each request owns its auth
    return JSON.parse(JSON.stringify(template));
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
   * Recursively collect paths from collection items. folderChain accumulates
   * the ancestor folders (nearest last) so we can resolve each request's
   * effective auth against the request → folders → collection chain.
   */
  collectPaths(items, paths, tagSet, folderName, authRefs, collectionAuth, folderChain) {
    for (const item of items || []) {
      if (item.type === 'folder') {
        tagSet.add(item.name);
        this.collectPaths(item.items, paths, tagSet, item.name, authRefs, collectionAuth, [...folderChain, item]);
      } else if (item.type === 'request') {
        this.addRequestToPath(item, paths, folderName, authRefs, collectionAuth, folderChain);
        if (folderName) {
          tagSet.add(folderName);
        }
      }
    }
  }

  /**
   * Resolve a request's effective auth at export time using the same chain
   * semantics as the runtime resolver (request → folders nearest first → collection).
   * `inherit`/undefined falls through; `none` stops the chain.
   */
  resolveAuthForExport(requestAuth, folderChain, collectionAuth) {
    const chain = [requestAuth, ...folderChain.slice().reverse().map(f => f.auth), collectionAuth];
    for (const a of chain) {
      if (!a) continue;
      if (a.type === 'inherit') continue;
      return a;
    }
    return null;
  }

  /**
   * Convert a Nikode request to an OpenAPI path operation
   */
  addRequestToPath(request, paths, folderName, authRefs, collectionAuth = null, folderChain = []) {
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

    // Resolve effective auth using the same chain as the runtime resolver, then
    // emit a per-operation security override ONLY when it differs from the
    // collection's global default (or 'none' when collection has a default).
    // We never emit credential values — only the scheme reference.
    const resolved = this.resolveAuthForExport(request.auth, folderChain, collectionAuth);

    if (resolved && resolved.type !== 'none') {
      // Concrete resolved auth — emit override only if it differs from collection default
      if (!this.authsAreEquivalent(resolved, collectionAuth)) {
        const schemeName = this.authTypeToSchemeName(resolved.type);
        if (schemeName) {
          operation.security = [{ [schemeName]: [] }];
          if (authRefs) authRefs.add(resolved.type);
        }
      }
    } else if (resolved && resolved.type === 'none' && collectionAuth) {
      // Explicit 'none' with a global default — emit empty array to opt out
      operation.security = [];
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

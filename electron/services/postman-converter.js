const fs = require('fs/promises');
const path = require('path');

/**
 * Postman Converter
 * Handles import of Postman Collection v2.1 files and Postman Environment files
 */
class PostmanConverter {
  /**
   * Import a Postman v2.1 collection and convert to Nikode Collection
   * @param {string} filePath - Path to the Postman collection JSON file
   * @returns {Promise<object>} Nikode Collection object
   */
  async importFromPostman(filePath) {
    const data = await fs.readFile(filePath, 'utf-8');
    const postman = JSON.parse(data);

    // Validate Postman v2.1 format
    if (!postman.info?.schema?.includes('schema.getpostman.com')) {
      throw new Error('Invalid Postman collection: missing or unrecognized schema');
    }

    const name = postman.info.name || path.basename(filePath, path.extname(filePath));

    // Convert collection variables to a default environment
    const environments = [];
    if (Array.isArray(postman.variable) && postman.variable.length > 0) {
      environments.push({
        id: `env-${this.slugify(name)}-${Date.now()}`,
        name: 'Postman Variables',
        variables: postman.variable.map(v => ({
          key: v.key || '',
          value: v.value?.toString() || '',
          enabled: true,
        })),
      });
    }

    if (environments.length === 0) {
      environments.push({
        id: 'env-default',
        name: 'default',
        variables: [],
      });
    }

    // Recursively convert items
    const items = this.convertItems(postman.item || []);

    return {
      name,
      version: '1.0.0',
      environments,
      activeEnvironmentId: environments[0].id,
      items,
    };
  }

  /**
   * Import a Postman environment file and convert to Nikode Environment
   * @param {string} filePath - Path to the .postman_environment.json file
   * @returns {Promise<object>} Nikode Environment object
   */
  async importEnvironment(filePath) {
    const data = await fs.readFile(filePath, 'utf-8');
    const env = JSON.parse(data);

    if (!env.name || !Array.isArray(env.values)) {
      throw new Error('Invalid Postman environment: missing "name" or "values"');
    }

    return {
      id: `env-${this.slugify(env.name)}-${Date.now()}`,
      name: env.name,
      variables: env.values.map(v => ({
        key: v.key || '',
        value: v.value?.toString() || '',
        enabled: v.enabled !== false,
        ...(v.type === 'secret' ? { secret: true } : {}),
      })),
    };
  }

  /**
   * Recursively convert Postman items to Nikode CollectionItems
   * @param {Array} items - Postman item array
   * @returns {Array} Nikode CollectionItem array
   */
  convertItems(items) {
    return items.map(item => {
      // Folder: has nested item[] but no request
      if (Array.isArray(item.item)) {
        return {
          id: `folder-${this.slugify(item.name)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'folder',
          name: item.name || 'Untitled Folder',
          items: this.convertItems(item.item),
        };
      }

      // Request item
      return this.convertRequest(item);
    });
  }

  /**
   * Convert a single Postman request item to a Nikode CollectionItem
   * @param {object} item - Postman request item
   * @returns {object} Nikode CollectionItem
   */
  convertRequest(item) {
    const request = item.request || {};
    const method = (typeof request === 'string' ? 'GET' : (request.method || 'GET')).toUpperCase();

    // Determine if this is a GraphQL request
    const isGraphQL = request.body?.mode === 'graphql';
    const type = isGraphQL ? 'graphql' : 'request';

    const id = `req-${this.slugify(item.name)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const result = {
      id,
      type,
      name: item.name || 'Untitled Request',
      method,
      url: this.convertUrl(request.url),
      params: this.convertQueryParams(request.url),
      headers: this.convertHeaders(request.header, request.auth),
      body: this.convertBody(request.body),
      scripts: this.convertScripts(item.event),
      docs: request.description || '',
    };

    // For GraphQL items, extract gqlQuery and gqlVariables
    if (isGraphQL && request.body?.graphql) {
      result.gqlQuery = request.body.graphql.query || '';
      result.gqlVariables = request.body.graphql.variables || '';
    }

    return result;
  }

  /**
   * Convert Postman URL to string
   * Handles both string and object URL formats
   * @param {string|object} url - Postman URL
   * @returns {string} URL string
   */
  convertUrl(url) {
    if (!url) return '';
    if (typeof url === 'string') return url;
    if (url.raw) return url.raw.split('?')[0]; // Strip query string, we handle params separately
    if (Array.isArray(url.host) && Array.isArray(url.path)) {
      const host = url.host.join('.');
      const pathStr = url.path.join('/');
      const protocol = url.protocol ? `${url.protocol}://` : '';
      return `${protocol}${host}/${pathStr}`;
    }
    return '';
  }

  /**
   * Extract query parameters from Postman URL
   * @param {string|object} url - Postman URL
   * @returns {Array} KeyValue array for params
   */
  convertQueryParams(url) {
    if (!url || typeof url === 'string') return [];
    if (!Array.isArray(url.query) || url.query.length === 0) return [];

    return url.query.map(q => ({
      key: q.key || '',
      value: q.value || '',
      enabled: q.disabled !== true,
    }));
  }

  /**
   * Convert Postman headers and auth to Nikode headers
   * @param {Array} headers - Postman header array
   * @param {object} auth - Postman auth object
   * @returns {Array} KeyValue array for headers
   */
  convertHeaders(headers, auth) {
    const result = [];

    if (Array.isArray(headers)) {
      for (const h of headers) {
        result.push({
          key: h.key || '',
          value: h.value || '',
          enabled: h.disabled !== true,
        });
      }
    }

    // Flatten auth to Authorization header
    const authHeader = this.convertAuth(auth);
    if (authHeader) {
      result.push(authHeader);
    }

    // Add empty row for editing (matching OpenAPI converter pattern)
    result.push({ key: '', value: '', enabled: true });

    return result;
  }

  /**
   * Convert Postman auth config to an Authorization header
   * @param {object} auth - Postman auth object
   * @returns {object|null} KeyValue for Authorization header, or null
   */
  convertAuth(auth) {
    if (!auth || !auth.type) return null;

    if (auth.type === 'bearer') {
      const tokenEntry = (auth.bearer || []).find(e => e.key === 'token');
      const token = tokenEntry?.value || '';
      return {
        key: 'Authorization',
        value: `Bearer ${token}`,
        enabled: true,
      };
    }

    if (auth.type === 'basic') {
      const entries = auth.basic || [];
      const username = (entries.find(e => e.key === 'username')?.value || '');
      const password = (entries.find(e => e.key === 'password')?.value || '');
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      return {
        key: 'Authorization',
        value: `Basic ${encoded}`,
        enabled: true,
      };
    }

    // Other auth types (apikey, oauth2, etc.) — skip
    return null;
  }

  /**
   * Convert Postman request body to Nikode RequestBody
   * @param {object} body - Postman body object
   * @returns {object} Nikode RequestBody
   */
  convertBody(body) {
    if (!body || !body.mode) {
      return { type: 'none' };
    }

    switch (body.mode) {
      case 'raw': {
        const language = body.options?.raw?.language;
        if (language === 'json') {
          return {
            type: 'json',
            content: body.raw || '',
          };
        }
        return {
          type: 'raw',
          content: body.raw || '',
        };
      }

      case 'formdata':
        return {
          type: 'form-data',
          entries: (body.formdata || []).map(e => ({
            key: e.key || '',
            value: e.value || '',
            enabled: e.disabled !== true,
          })),
        };

      case 'urlencoded':
        return {
          type: 'x-www-form-urlencoded',
          entries: (body.urlencoded || []).map(e => ({
            key: e.key || '',
            value: e.value || '',
            enabled: e.disabled !== true,
          })),
        };

      case 'graphql':
        // Body is handled at the item level for gqlQuery/gqlVariables
        return { type: 'none' };

      default:
        return { type: 'none' };
    }
  }

  /**
   * Convert Postman event scripts to Nikode Scripts
   * @param {Array} events - Postman event array
   * @returns {object} Nikode Scripts { pre, post }
   */
  convertScripts(events) {
    const scripts = { pre: '', post: '' };
    if (!Array.isArray(events)) return scripts;

    for (const event of events) {
      const source = Array.isArray(event.script?.exec)
        ? event.script.exec.join('\n')
        : (event.script?.exec || '');

      if (event.listen === 'prerequest') {
        scripts.pre = source;
      } else if (event.listen === 'test') {
        scripts.post = source;
      }
    }

    return scripts;
  }

  /**
   * Convert string to slug
   * @param {string} str - Input string
   * @returns {string} Slugified string
   */
  slugify(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}

module.exports = { PostmanConverter };

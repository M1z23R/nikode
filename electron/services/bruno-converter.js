const fs = require('fs/promises');
const path = require('path');

/**
 * Bruno Converter
 * Handles import of Bruno collection folders (.bru files)
 */
class BrunoConverter {
  /**
   * Parse a .bru file content into an object
   * @param {string} content - Raw .bru file content
   * @returns {object} Parsed blocks
   */
  parseBruFile(content) {
    const result = {
      meta: {},
      http: null,
      headers: {},
      query: [],
      body: null,
      auth: null,
      vars: [],
      script: { pre: '', post: '' }
    };

    const lines = content.split('\n');
    let currentBlock = null;
    let currentBlockName = null;
    let blockContent = [];
    let braceDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect block start: "blockname {" or "blockname:subtype {"
      const blockMatch = trimmed.match(/^([\w:-]+)\s*\{$/);
      if (blockMatch && braceDepth === 0) {
        currentBlock = blockMatch[1];
        currentBlockName = currentBlock;
        braceDepth = 1;
        blockContent = [];
        continue;
      }

      // Track nested braces
      if (braceDepth > 0) {
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        if (braceDepth === 0) {
          // Block ended
          this.processBlock(result, currentBlockName, blockContent);
          currentBlock = null;
          currentBlockName = null;
          blockContent = [];
        } else {
          blockContent.push(line);
        }
      }
    }

    return result;
  }

  /**
   * Process a parsed block into the result object
   */
  processBlock(result, blockName, lines) {
    const content = lines.join('\n').trim();

    if (blockName === 'meta') {
      result.meta = this.parseKeyValueBlock(lines);
    } else if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(blockName)) {
      result.http = {
        method: blockName.toUpperCase(),
        ...this.parseKeyValueBlock(lines)
      };
    } else if (blockName === 'headers') {
      result.headers = this.parseKeyValueBlock(lines);
    } else if (blockName === 'query') {
      result.query = this.parseKeyValuePairs(lines);
    } else if (blockName === 'body:json') {
      result.body = { type: 'json', content };
    } else if (blockName === 'body:text') {
      result.body = { type: 'text', content };
    } else if (blockName === 'body:xml') {
      result.body = { type: 'xml', content };
    } else if (blockName === 'body:form-urlencoded') {
      result.body = { type: 'urlencoded', entries: this.parseKeyValuePairs(lines) };
    } else if (blockName === 'body:multipart-form') {
      result.body = { type: 'formdata', entries: this.parseKeyValuePairs(lines) };
    } else if (blockName === 'body:graphql') {
      result.body = { type: 'graphql', content };
    } else if (blockName === 'body:graphql:vars') {
      if (result.body && result.body.type === 'graphql') {
        result.body.variables = content;
      }
    } else if (blockName === 'auth:bearer') {
      result.auth = { type: 'bearer', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'auth:basic') {
      result.auth = { type: 'basic', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'auth:apikey') {
      result.auth = { type: 'apikey', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'vars') {
      result.vars = this.parseKeyValuePairs(lines);
    } else if (blockName === 'vars:secret') {
      result.vars.push(...this.parseKeyValuePairs(lines).map(v => ({ ...v, secret: true })));
    } else if (blockName === 'script:pre-request') {
      result.script.pre = content;
    } else if (blockName === 'script:post-response') {
      result.script.post = content;
    }
  }

  /**
   * Parse key: value lines into an object
   */
  parseKeyValueBlock(lines) {
    const result = {};
    for (const line of lines) {
      const match = line.trim().match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    return result;
  }

  /**
   * Parse key: value lines into array of {key, value, enabled}
   */
  parseKeyValuePairs(lines) {
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for disabled entries (prefixed with ~)
      const disabled = trimmed.startsWith('~');
      const cleanLine = disabled ? trimmed.slice(1).trim() : trimmed;

      const match = cleanLine.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        result.push({
          key: match[1],
          value: match[2],
          enabled: !disabled
        });
      }
    }
    return result;
  }

  /**
   * Import a Bruno collection folder and convert to Nikode Collection
   * @param {string} folderPath - Path to the Bruno collection folder
   * @returns {Promise<object>} Nikode Collection object
   */
  async importFromBruno(folderPath) {
    // Read bruno.json for collection metadata
    const brunoJsonPath = path.join(folderPath, 'bruno.json');
    let collectionName = path.basename(folderPath);

    try {
      const brunoJson = JSON.parse(await fs.readFile(brunoJsonPath, 'utf-8'));
      collectionName = brunoJson.name || collectionName;
    } catch (e) {
      // bruno.json is optional, use folder name
    }

    // Build environments from environments/ folder
    const environments = await this.loadEnvironments(folderPath);
    if (environments.length === 0) {
      environments.push({
        id: 'env-default',
        name: 'default',
        variables: []
      });
    }

    // Recursively build items from folder structure
    const items = await this.loadItems(folderPath, folderPath);

    return {
      name: collectionName,
      version: '1.0.0',
      environments,
      activeEnvironmentId: environments[0].id,
      items
    };
  }

  /**
   * Load environments from the environments/ folder
   */
  async loadEnvironments(folderPath) {
    const envDir = path.join(folderPath, 'environments');
    const environments = [];

    try {
      const files = await fs.readdir(envDir);
      for (const file of files) {
        if (!file.endsWith('.bru')) continue;

        const content = await fs.readFile(path.join(envDir, file), 'utf-8');
        const parsed = this.parseBruFile(content);

        const envName = path.basename(file, '.bru');
        environments.push({
          id: `env-${this.slugify(envName)}-${Date.now()}`,
          name: envName,
          variables: parsed.vars.map(v => ({
            key: v.key,
            value: v.value,
            enabled: v.enabled !== false,
            ...(v.secret ? { secret: true } : {})
          }))
        });
      }
    } catch (e) {
      // environments folder doesn't exist or is empty
    }

    return environments;
  }

  /**
   * Recursively load items from a folder
   */
  async loadItems(rootPath, currentPath) {
    const items = [];
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    // Sort entries: folders first, then files, both alphabetically
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      const entryPath = path.join(currentPath, entry.name);

      // Skip special folders
      if (entry.name === 'environments' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        // It's a folder - recurse
        const folderItems = await this.loadItems(rootPath, entryPath);

        // Read folder.bru for metadata if it exists
        let folderName = entry.name;
        try {
          const folderBru = await fs.readFile(path.join(entryPath, 'folder.bru'), 'utf-8');
          const parsed = this.parseBruFile(folderBru);
          if (parsed.meta.name) {
            folderName = parsed.meta.name;
          }
        } catch (e) {
          // No folder.bru, use directory name
        }

        items.push({
          id: `folder-${this.slugify(folderName)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'folder',
          name: folderName,
          items: folderItems
        });
      } else if (entry.name.endsWith('.bru') && entry.name !== 'folder.bru') {
        // It's a request file
        const content = await fs.readFile(entryPath, 'utf-8');
        const request = this.convertRequest(content, entry.name);
        if (request) {
          items.push(request);
        }
      }
    }

    // Sort by sequence number if available
    items.sort((a, b) => {
      const seqA = a._seq || 999;
      const seqB = b._seq || 999;
      return seqA - seqB;
    });

    // Remove _seq from final output
    items.forEach(item => delete item._seq);

    return items;
  }

  /**
   * Convert Bruno script (bru.* / res.* API) to Nikode script (nk.* API)
   * @param {string} script - Bruno script content
   * @param {boolean} isPostScript - Whether this is a post-response script
   * @returns {string} Converted Nikode script
   */
  convertScript(script, isPostScript = false) {
    if (!script || !script.trim()) {
      return script;
    }

    let converted = script;

    // Convert bru.setVar -> nk.setEnv (Bruno setVar persists like Nikode setEnv)
    converted = converted.replace(/\bbru\.setVar\s*\(/g, 'nk.setEnv(');

    // Convert bru.getVar -> nk.getEnv
    converted = converted.replace(/\bbru\.getVar\s*\(/g, 'nk.getEnv(');

    // Convert bru.setEnvVar -> nk.setEnv
    converted = converted.replace(/\bbru\.setEnvVar\s*\(/g, 'nk.setEnv(');

    // Convert bru.getEnvVar -> nk.getEnv
    converted = converted.replace(/\bbru\.getEnvVar\s*\(/g, 'nk.getEnv(');

    // Convert req.getUrl() -> nk.request.url
    converted = converted.replace(/\breq\.getUrl\s*\(\s*\)/g, 'nk.request.url');

    // Convert req.getMethod() -> nk.request.method
    converted = converted.replace(/\breq\.getMethod\s*\(\s*\)/g, 'nk.request.method');

    // Convert req.getBody() -> nk.request.body
    converted = converted.replace(/\breq\.getBody\s*\(\s*\)/g, 'nk.request.body');

    // Convert req.getHeader(name) -> nk.request.headers[name]
    converted = converted.replace(/\breq\.getHeader\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
      'nk.request.headers["$2"]');

    // Convert req.getHeaders() -> nk.request.headers
    converted = converted.replace(/\breq\.getHeaders\s*\(\s*\)/g, 'nk.request.headers');

    // For post-response scripts, handle response object conversions
    if (isPostScript) {
      // Convert res.status -> nk.response.statusCode
      converted = converted.replace(/\bres\.status\b/g, 'nk.response.statusCode');

      // Convert res.statusText -> nk.response.statusText
      converted = converted.replace(/\bres\.statusText\b/g, 'nk.response.statusText');

      // Convert res.headers -> nk.response.headers
      converted = converted.replace(/\bres\.headers\b/g, 'nk.response.headers');

      // Convert res.getHeader(name) -> nk.response.headers[name]
      converted = converted.replace(/\bres\.getHeader\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        'nk.response.headers["$2"]');

      // Convert res.responseTime -> nk.response.time
      converted = converted.replace(/\bres\.responseTime\b/g, 'nk.response.time');

      // Handle res.body - in Bruno it's parsed, in Nikode it's a string
      // Check if res.body is used with property access (res.body.something)
      if (/\bres\.body\s*\./.test(converted) || /\bres\.body\s*\[/.test(converted)) {
        // Add a helper variable at the top to parse the body once
        const bodyParseHelper = '// Auto-converted: Bruno res.body is pre-parsed, Nikode nk.response.body is a string\nconst __brunoBody = JSON.parse(nk.response.body);\n';

        // Replace res.body with __brunoBody
        converted = converted.replace(/\bres\.body\b/g, '__brunoBody');

        // Prepend the helper
        converted = bodyParseHelper + converted;
      } else {
        // Simple res.body usage - just wrap in JSON.parse
        converted = converted.replace(/\bres\.body\b/g, 'JSON.parse(nk.response.body)');
      }
    }

    return converted;
  }

  /**
   * Convert a parsed .bru file to a Nikode request item
   */
  convertRequest(content, fileName) {
    const parsed = this.parseBruFile(content);

    if (!parsed.http) {
      return null; // Not a valid request file
    }

    const name = parsed.meta.name || path.basename(fileName, '.bru');
    const id = `req-${this.slugify(name)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const request = {
      id,
      type: parsed.meta.type === 'graphql' ? 'graphql' : 'request',
      name,
      method: parsed.http.method,
      url: parsed.http.url || '',
      _seq: parseInt(parsed.meta.seq, 10) || 999
    };

    // Headers
    if (Object.keys(parsed.headers).length > 0) {
      request.headers = Object.entries(parsed.headers).map(([key, value]) => ({
        key,
        value,
        enabled: true
      }));
    }

    // Query params
    if (parsed.query.length > 0) {
      request.params = parsed.query;
    }

    // Body
    if (parsed.body) {
      request.body = this.convertBody(parsed.body);
    }

    // Auth
    if (parsed.auth) {
      request.auth = this.convertAuth(parsed.auth);
    }

    // Scripts - convert Bruno API to Nikode API
    if (parsed.script.pre || parsed.script.post) {
      request.scripts = {
        pre: this.convertScript(parsed.script.pre, false),
        post: this.convertScript(parsed.script.post, true)
      };
    }

    // GraphQL specific
    if (parsed.meta.type === 'graphql' && parsed.body?.type === 'graphql') {
      request.gqlQuery = parsed.body.content;
      request.gqlVariables = parsed.body.variables || '';
    }

    return request;
  }

  /**
   * Convert Bruno body to Nikode body format
   */
  convertBody(body) {
    switch (body.type) {
      case 'json':
        return { type: 'json', content: body.content };
      case 'text':
        return { type: 'raw', content: body.content };
      case 'xml':
        return { type: 'xml', content: body.content };
      case 'urlencoded':
        return {
          type: 'urlencoded',
          entries: body.entries.map(e => ({ key: e.key, value: e.value, enabled: e.enabled }))
        };
      case 'formdata':
        return {
          type: 'form-data',
          entries: body.entries.map(e => ({ key: e.key, value: e.value, enabled: e.enabled, type: 'text' }))
        };
      case 'graphql':
        return { type: 'graphql', query: body.content, variables: body.variables || '' };
      default:
        return null;
    }
  }

  /**
   * Convert Bruno auth to Nikode auth format
   */
  convertAuth(auth) {
    switch (auth.type) {
      case 'bearer':
        return { type: 'bearer', token: auth.token || '' };
      case 'basic':
        return { type: 'basic', username: auth.username || '', password: auth.password || '' };
      case 'apikey':
        return {
          type: 'apikey',
          key: auth.key || '',
          value: auth.value || '',
          addTo: auth.placement === 'queryparams' ? 'query' : 'header'
        };
      default:
        return null;
    }
  }

  /**
   * Create a URL-safe slug from a string
   */
  slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Export collection to Bruno folder structure
   * @param {object} collection - Nikode collection object
   * @param {string} targetPath - Target folder path
   * @returns {Promise<object>} Statistics about the export
   */
  async exportToBruno(collection, targetPath) {
    const fs = require('fs/promises');
    const stats = { requests: 0, folders: 0, environments: 0, skipped: [] };

    await fs.mkdir(targetPath, { recursive: true });

    const brunoJson = {
      version: '1',
      name: collection.name,
      type: 'collection',
    };
    await fs.writeFile(
      path.join(targetPath, 'bruno.json'),
      JSON.stringify(brunoJson, null, 2)
    );

    await this.exportItemsToFolder(collection.items || [], targetPath, stats);

    if (collection.environments?.length > 0) {
      const envDir = path.join(targetPath, 'environments');
      await fs.mkdir(envDir, { recursive: true });

      for (const env of collection.environments) {
        const envContent = this.generateEnvironmentBru(env);
        const fileName = this.sanitizeFileName(env.name) + '.bru';
        await fs.writeFile(path.join(envDir, fileName), envContent);
        stats.environments++;
      }
    }

    return stats;
  }

  /**
   * Recursively export items to folder structure
   * @param {array} items - Collection items (requests and folders)
   * @param {string} folderPath - Current folder path
   * @param {object} stats - Statistics object
   * @param {number} seq - Sequence number for requests
   */
  async exportItemsToFolder(items, folderPath, stats, seq = 1) {
    const fs = require('fs/promises');

    for (const item of items) {
      if (item.type === 'folder') {
        const folderName = this.sanitizeFileName(item.name);
        const subFolderPath = path.join(folderPath, folderName);
        await fs.mkdir(subFolderPath, { recursive: true });

        const folderBru = `meta {\n  name: ${item.name}\n}\n`;
        await fs.writeFile(path.join(subFolderPath, 'folder.bru'), folderBru);

        stats.folders++;
        await this.exportItemsToFolder(item.items || [], subFolderPath, stats, 1);
      } else if (item.type === 'websocket') {
        stats.skipped.push({ name: item.name, reason: 'WebSocket not supported' });
      } else {
        const bruContent = this.generateRequestBru(item, seq++);
        const fileName = this.sanitizeFileName(item.name) + '.bru';
        await fs.writeFile(path.join(folderPath, fileName), bruContent);
        stats.requests++;
      }
    }
  }

  /**
   * Generate .bru file content for a request
   * @param {object} item - Request item
   * @param {number} seq - Sequence number
   * @returns {string} .bru file content
   */
  generateRequestBru(item, seq) {
    const parts = [];

    parts.push(`meta {
  name: ${item.name}
  type: ${item.type === 'graphql' ? 'graphql' : 'http'}
  seq: ${seq}
}`);

    const method = (item.method || 'get').toLowerCase();
    parts.push(`\n${method} {
  url: ${item.url || ''}
}`);

    if (item.params?.length > 0) {
      const params = item.params
        .filter(p => p.key)
        .map(p => `  ${p.enabled === false ? '~' : ''}${p.key}: ${p.value || ''}`)
        .join('\n');
      if (params) {
        parts.push(`\nquery {\n${params}\n}`);
      }
    }

    if (item.headers?.length > 0) {
      const headers = item.headers
        .filter(h => h.key)
        .map(h => `  ${h.enabled === false ? '~' : ''}${h.key}: ${h.value || ''}`)
        .join('\n');
      if (headers) {
        parts.push(`\nheaders {\n${headers}\n}`);
      }
    }

    if (item.auth && item.auth.type !== 'none') {
      parts.push('\n' + this.generateAuthBlock(item.auth));
    }

    if (item.body && item.body.type !== 'none') {
      parts.push('\n' + this.generateBodyBlock(item.body));
    }

    if (item.type === 'graphql' && item.gqlQuery) {
      parts.push(`\nbody:graphql {\n${item.gqlQuery}\n}`);
      if (item.gqlVariables) {
        parts.push(`\nbody:graphql:vars {\n${item.gqlVariables}\n}`);
      }
    }

    if (item.scripts?.pre) {
      const WARNING = '// WARNING: This script uses Nikode (nk.*) API\n// Manual conversion to bru.* may be required\n\n';
      parts.push(`\nscript:pre-request {\n${WARNING}${item.scripts.pre}\n}`);
    }
    if (item.scripts?.post) {
      const WARNING = '// WARNING: This script uses Nikode (nk.*) API\n// Manual conversion to bru.* may be required\n\n';
      parts.push(`\nscript:post-response {\n${WARNING}${item.scripts.post}\n}`);
    }

    if (item.docs) {
      parts.push(`\ndocs {\n${item.docs}\n}`);
    }

    return parts.join('\n') + '\n';
  }

  /**
   * Generate auth block for .bru file
   * @param {object} auth - Auth configuration
   * @returns {string} Auth block content
   */
  generateAuthBlock(auth) {
    switch (auth.type) {
      case 'bearer':
        return `auth:bearer {\n  token: ${auth.token || ''}\n}`;
      case 'basic':
        return `auth:basic {\n  username: ${auth.username || ''}\n  password: ${auth.password || ''}\n}`;
      case 'api-key':
        return `auth:apikey {\n  key: ${auth.key || ''}\n  value: ${auth.value || ''}\n  placement: ${auth.addTo === 'query' ? 'queryparams' : 'header'}\n}`;
      default:
        return '';
    }
  }

  /**
   * Generate body block for .bru file
   * @param {object} body - Body configuration
   * @returns {string} Body block content
   */
  generateBodyBlock(body) {
    switch (body.type) {
      case 'json':
        return `body:json {\n${body.content || ''}\n}`;
      case 'raw':
        return `body:text {\n${body.content || ''}\n}`;
      case 'x-www-form-urlencoded':
        const urlencoded = (body.entries || [])
          .filter(e => e.key)
          .map(e => `  ${e.enabled === false ? '~' : ''}${e.key}: ${e.value || ''}`)
          .join('\n');
        return `body:form-urlencoded {\n${urlencoded}\n}`;
      case 'form-data':
        const formdata = (body.entries || [])
          .filter(e => e.key)
          .map(e => `  ${e.enabled === false ? '~' : ''}${e.key}: ${e.value || ''}`)
          .join('\n');
        return `body:multipart-form {\n${formdata}\n}`;
      default:
        return '';
    }
  }

  /**
   * Generate environment .bru file content
   * @param {object} env - Environment object
   * @returns {string} Environment .bru file content
   */
  generateEnvironmentBru(env) {
    const vars = [];
    const secretVars = [];

    for (const v of env.variables || []) {
      if (!v.key) continue;
      const line = `  ${v.enabled === false ? '~' : ''}${v.key}: ${v.secret ? '' : v.value || ''}`;
      if (v.secret) {
        secretVars.push(line + ' // SECRET: re-enter after import');
      } else {
        vars.push(line);
      }
    }

    let content = '';
    if (vars.length > 0) {
      content += `vars {\n${vars.join('\n')}\n}\n`;
    }
    if (secretVars.length > 0) {
      content += `\nvars:secret {\n${secretVars.join('\n')}\n}\n`;
    }

    return content || 'vars {\n}\n';
  }

  /**
   * Sanitize a file name for safe use in file system
   * @param {string} name - Original name
   * @returns {string} Sanitized file name
   */
  sanitizeFileName(name) {
    return (name || 'untitled')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100) || 'untitled';
  }
}

module.exports = { BrunoConverter };

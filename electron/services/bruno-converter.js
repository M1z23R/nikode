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

    // Scripts
    if (parsed.script.pre || parsed.script.post) {
      request.scripts = {
        pre: parsed.script.pre,
        post: parsed.script.post
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
}

module.exports = { BrunoConverter };

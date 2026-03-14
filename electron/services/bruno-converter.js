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
}

module.exports = { BrunoConverter };

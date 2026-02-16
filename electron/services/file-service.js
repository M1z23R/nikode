const fs = require('fs/promises');
const path = require('path');

const COLLECTION_FILE_NAME = 'nikode.json';

class FileService {
  async readCollection(dirPath) {
    const filePath = path.join(dirPath, COLLECTION_FILE_NAME);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }

  async writeCollection(dirPath, collection) {
    const filePath = path.join(dirPath, COLLECTION_FILE_NAME);
    const data = JSON.stringify(collection, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  async collectionExists(dirPath) {
    const filePath = path.join(dirPath, COLLECTION_FILE_NAME);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteCollection(dirPath) {
    const filePath = path.join(dirPath, COLLECTION_FILE_NAME);
    await fs.unlink(filePath);
  }

  async createCollection(dirPath, name) {
    await fs.mkdir(dirPath, { recursive: true });

    const collection = {
      name,
      version: '1.0.0',
      environments: [
        {
          id: 'env-default',
          name: 'default',
          variables: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
        },
      ],
      activeEnvironmentId: 'env-default',
      items: [],
    };

    await this.writeCollection(dirPath, collection);
    return collection;
  }

  /**
   * Export a collection to a specific format
   * @param {string} dirPath - Path to the collection directory
   * @param {'json' | 'yaml'} format - Export format
   * @returns {Promise<string>} The exported content as a string
   */
  async exportCollection(dirPath, format = 'json') {
    const collection = await this.readCollection(dirPath);

    if (format === 'json') {
      return JSON.stringify(collection, null, 2);
    } else if (format === 'yaml') {
      // Simple YAML conversion (basic implementation)
      return this.toYaml(collection);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Import a collection from a source file to a target directory
   * @param {string} sourcePath - Path to the source file (JSON or YAML)
   * @param {string} targetPath - Path to the target directory
   * @returns {Promise<object>} The imported collection
   */
  async importCollection(sourcePath, targetPath) {
    const data = await fs.readFile(sourcePath, 'utf-8');
    const ext = path.extname(sourcePath).toLowerCase();

    let collection;
    if (ext === '.json') {
      collection = JSON.parse(data);
    } else if (ext === '.yaml' || ext === '.yml') {
      collection = this.fromYaml(data);
    } else {
      // Try JSON first
      try {
        collection = JSON.parse(data);
      } catch {
        throw new Error('Unsupported file format. Please use JSON or YAML.');
      }
    }

    // Validate the collection structure
    this.validateCollection(collection);

    // Ensure target directory exists
    await fs.mkdir(targetPath, { recursive: true });

    // Write the collection
    await this.writeCollection(targetPath, collection);

    return collection;
  }

  /**
   * Validates that an object has the required collection structure
   * @param {object} collection
   * @throws {Error} If validation fails
   */
  validateCollection(collection) {
    if (!collection || typeof collection !== 'object') {
      throw new Error('Invalid collection: must be an object');
    }

    if (typeof collection.name !== 'string') {
      throw new Error('Invalid collection: missing or invalid "name" field');
    }

    if (!Array.isArray(collection.environments)) {
      throw new Error('Invalid collection: missing or invalid "environments" field');
    }

    if (!Array.isArray(collection.items)) {
      throw new Error('Invalid collection: missing or invalid "items" field');
    }
  }

  /**
   * Simple YAML serialization (basic implementation)
   * For full YAML support, consider using a library like js-yaml
   */
  toYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let result = '';

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          result += `${spaces}-\n${this.toYaml(item, indent + 1)}`;
        } else {
          result += `${spaces}- ${this.yamlValue(item)}\n`;
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value) && value.length === 0) {
            result += `${spaces}${key}: []\n`;
          } else if (typeof value === 'object' && Object.keys(value).length === 0) {
            result += `${spaces}${key}: {}\n`;
          } else {
            result += `${spaces}${key}:\n${this.toYaml(value, indent + 1)}`;
          }
        } else {
          result += `${spaces}${key}: ${this.yamlValue(value)}\n`;
        }
      }
    }

    return result;
  }

  yamlValue(value) {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      // Quote strings that need it
      if (value.includes(':') || value.includes('#') || value.includes('\n') ||
          value.startsWith(' ') || value.endsWith(' ') ||
          value === '' || /^[0-9]/.test(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    return String(value);
  }

  /**
   * Simple YAML parsing (very basic implementation)
   * For full YAML support, consider using a library like js-yaml
   * This handles basic cases but may not work for all YAML files
   */
  fromYaml(yamlString) {
    // For simplicity, we'll just try to parse it as JSON if it looks like JSON
    // or throw an error suggesting JSON import instead
    try {
      return JSON.parse(yamlString);
    } catch {
      throw new Error('YAML import requires JSON format. Please convert your YAML file to JSON first.');
    }
  }

  /**
   * Detects the format of a file (Nikode collection, OpenAPI spec, or unknown)
   * @param {string} filePath - Path to the file to detect
   * @returns {Promise<'nikode' | 'openapi' | 'unknown'>}
   */
  async detectFileFormat(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let parsed;
      if (ext === '.json') {
        parsed = JSON.parse(data);
      } else if (ext === '.yaml' || ext === '.yml') {
        // Basic YAML detection - try JSON first, then check for YAML markers
        try {
          parsed = JSON.parse(data);
        } catch {
          // For YAML files, check for common OpenAPI markers in raw text
          if (data.includes('openapi:') || data.includes('swagger:')) {
            return 'openapi';
          }
          if (data.includes('name:') && data.includes('environments:') && data.includes('items:')) {
            return 'nikode';
          }
          return 'unknown';
        }
      } else {
        // Try JSON for unknown extensions
        try {
          parsed = JSON.parse(data);
        } catch {
          return 'unknown';
        }
      }

      // Check for OpenAPI/Swagger spec
      if (parsed.openapi || parsed.swagger) {
        return 'openapi';
      }

      // Check for Nikode collection structure
      if (
        typeof parsed.name === 'string' &&
        Array.isArray(parsed.environments) &&
        Array.isArray(parsed.items)
      ) {
        return 'nikode';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

module.exports = { FileService };

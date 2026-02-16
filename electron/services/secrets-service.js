const fs = require('fs/promises');
const path = require('path');
const os = require('os');

class SecretsService {
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'nikode');
  }

  async init() {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  get secretsPath() {
    return path.join(this.configDir, 'secrets.json');
  }

  get recentPath() {
    return path.join(this.configDir, 'recent.json');
  }

  async readSecretsFile() {
    try {
      const data = await fs.readFile(this.secretsPath, 'utf-8');
      const secrets = JSON.parse(data);
      if (!secrets.collections) {
        secrets.collections = {};
      }
      return secrets;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { collections: {} };
      }
      throw err;
    }
  }

  async writeSecretsFile(secrets) {
    const data = JSON.stringify(secrets, null, 2);
    await fs.writeFile(this.secretsPath, data, { mode: 0o600 });
  }

  async getSecrets(collectionPath) {
    const secrets = await this.readSecretsFile();
    return secrets.collections[collectionPath] || {};
  }

  async saveSecrets(collectionPath, collectionSecrets) {
    const secrets = await this.readSecretsFile();
    secrets.collections[collectionPath] = collectionSecrets;
    await this.writeSecretsFile(secrets);
  }

  async getRecentPaths() {
    try {
      const data = await fs.readFile(this.recentPath, 'utf-8');
      const recent = JSON.parse(data);
      return recent.paths || [];
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async addRecentPath(pathToAdd) {
    let paths = await this.getRecentPaths();

    // Remove if already exists
    paths = paths.filter((p) => p !== pathToAdd);

    // Add to front
    paths.unshift(pathToAdd);

    // Keep only last 10
    paths = paths.slice(0, 10);

    const data = JSON.stringify({ paths }, null, 2);
    await fs.writeFile(this.recentPath, data, 'utf-8');
  }

  async removeRecentPath(pathToRemove) {
    let paths = await this.getRecentPaths();
    paths = paths.filter((p) => p !== pathToRemove);
    const data = JSON.stringify({ paths }, null, 2);
    await fs.writeFile(this.recentPath, data, 'utf-8');
  }
}

module.exports = { SecretsService };

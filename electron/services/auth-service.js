const fs = require('fs/promises');
const path = require('path');
const os = require('os');

class AuthService {
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'nikode');
  }

  async init() {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  get authPath() {
    return path.join(this.configDir, 'auth.json');
  }

  async getTokens() {
    try {
      const data = await fs.readFile(this.authPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async saveTokens(tokens) {
    const data = JSON.stringify(tokens, null, 2);
    await fs.writeFile(this.authPath, data, { mode: 0o600 });
  }

  async clearTokens() {
    try {
      await fs.unlink(this.authPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

module.exports = { AuthService };

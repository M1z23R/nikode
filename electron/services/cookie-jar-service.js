const fs = require('fs/promises');
const path = require('path');
const os = require('os');

class CookieJarService {
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'nikode');
  }

  async init() {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  get cookiesPath() {
    return path.join(this.configDir, 'cookies.json');
  }

  async readCookiesFile() {
    try {
      const data = await fs.readFile(this.cookiesPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (!parsed.jars) {
        parsed.jars = {};
      }
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { jars: {} };
      }
      throw err;
    }
  }

  async writeCookiesFile(data) {
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(this.cookiesPath, content, { mode: 0o600 });
  }

  async getCookies(collectionPath) {
    const data = await this.readCookiesFile();
    return data.jars[collectionPath] || [];
  }

  async saveCookies(collectionPath, cookies) {
    const data = await this.readCookiesFile();
    data.jars[collectionPath] = cookies;
    await this.writeCookiesFile(data);
  }

  async clearCookies(collectionPath) {
    const data = await this.readCookiesFile();
    data.jars[collectionPath] = [];
    await this.writeCookiesFile(data);
  }

  async deleteCookie(collectionPath, name, domain, cookiePath) {
    const cookies = await this.getCookies(collectionPath);
    const filtered = cookies.filter(
      (c) =>
        !(
          c.name === name &&
          c.domain.toLowerCase() === domain.toLowerCase() &&
          c.path === cookiePath
        ),
    );
    await this.saveCookies(collectionPath, filtered);
    return filtered;
  }

  /**
   * Add cookies from a Set-Cookie response into the jar.
   * Replaces existing cookies with same (name, domain, path) triple.
   * Removes expired cookies (max-age=0 or past expiry).
   */
  async addCookies(collectionPath, newCookies, requestUrl) {
    let cookies = await this.getCookies(collectionPath);
    const url = new URL(requestUrl);

    for (const nc of newCookies) {
      // Default domain to request host if not set
      let domain = nc.domain || url.hostname;
      // Strip leading dot for normalization in storage but keep it for matching
      if (domain.startsWith('.')) {
        domain = domain.substring(1);
      }

      const cookiePath = nc.path || '/';

      // Check if cookie should be removed (expired or max-age=0)
      if (this.isExpired(nc)) {
        cookies = cookies.filter(
          (c) =>
            !(
              c.name === nc.name &&
              c.domain.toLowerCase() === domain.toLowerCase() &&
              c.path === cookiePath
            ),
        );
        continue;
      }

      // Remove existing cookie with same (name, domain, path)
      cookies = cookies.filter(
        (c) =>
          !(
            c.name === nc.name &&
            c.domain.toLowerCase() === domain.toLowerCase() &&
            c.path === cookiePath
          ),
      );

      // Add the new cookie
      cookies.push({
        name: nc.name,
        value: nc.value,
        domain,
        path: cookiePath,
        expires: nc.expires || '',
        httpOnly: nc.httpOnly || false,
        secure: nc.secure || false,
      });
    }

    await this.saveCookies(collectionPath, cookies);
    return cookies;
  }

  /**
   * Get cookies from the jar that match a given URL.
   * Respects domain matching, path matching, secure flag, and expiration.
   */
  getMatchingCookies(cookies, url) {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const requestPath = parsed.pathname || '/';
    const isSecure = parsed.protocol === 'https:';

    return cookies.filter((cookie) => {
      // Check secure flag
      if (cookie.secure && !isSecure) return false;

      // Check expiration
      if (this.isExpired(cookie)) return false;

      // Domain matching
      const cookieDomain = cookie.domain.toLowerCase();
      if (!this.domainMatches(hostname, cookieDomain)) return false;

      // Path matching
      if (!this.pathMatches(requestPath, cookie.path)) return false;

      return true;
    });
  }

  /**
   * Check if hostname matches the cookie domain.
   * "example.com" matches "example.com" and "sub.example.com"
   */
  domainMatches(hostname, cookieDomain) {
    if (hostname === cookieDomain) return true;
    // Cookie domain "example.com" should match "sub.example.com"
    if (hostname.endsWith('.' + cookieDomain)) return true;
    return false;
  }

  /**
   * Check if request path matches cookie path.
   * Cookie path "/api" matches "/api", "/api/users", "/api/users/123"
   */
  pathMatches(requestPath, cookiePath) {
    if (requestPath === cookiePath) return true;
    if (requestPath.startsWith(cookiePath)) {
      // Ensure it's a proper prefix (/api matches /api/x but not /apifoo)
      if (cookiePath.endsWith('/')) return true;
      if (requestPath[cookiePath.length] === '/') return true;
    }
    return false;
  }

  /**
   * Check if a cookie is expired
   */
  isExpired(cookie) {
    if (!cookie.expires) return false;
    try {
      const expiryDate = new Date(cookie.expires);
      return expiryDate.getTime() <= Date.now();
    } catch {
      return false;
    }
  }
}

module.exports = { CookieJarService };

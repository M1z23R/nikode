const { BrowserWindow } = require('electron');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Handles OAuth 2.0 token acquisition for the renderer.
 * Routing through the main process avoids browser CORS preflight issues
 * with token endpoints (Keycloak, Auth0, Okta, etc.) and lets us drive
 * the authorization_code redirect flow inside an Electron BrowserWindow.
 */
class OAuth2Service {
  /**
   * @param {BrowserWindow} parentWindow - Used to anchor the auth popup.
   * @param {object} config
   * @param {'client_credentials'|'password'|'authorization_code'} config.grantType
   * @param {string} config.tokenUrl
   * @param {string} [config.authUrl]
   * @param {string} [config.clientId]
   * @param {string} [config.clientSecret]
   * @param {string} [config.username]
   * @param {string} [config.password]
   * @param {string} [config.callbackUrl]
   * @param {string} [config.scope]
   * @param {boolean} [config.usePkce]
   * @returns {Promise<object>} Token response from the server
   */
  async getToken(parentWindow, config) {
    if (!config?.tokenUrl) {
      throw new Error('tokenUrl is required');
    }
    switch (config.grantType) {
      case 'client_credentials':
        return this.clientCredentialsGrant(config);
      case 'password':
        return this.passwordGrant(config);
      case 'authorization_code':
        return this.authorizationCodeGrant(parentWindow, config);
      default:
        throw new Error(`Unsupported grant type: ${config.grantType}`);
    }
  }

  async clientCredentialsGrant({ tokenUrl, clientId, clientSecret, scope }) {
    if (!clientId) throw new Error('clientId is required');
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('client_id', clientId);
    if (clientSecret) params.set('client_secret', clientSecret);
    if (scope) params.set('scope', scope);
    return this.postTokenEndpoint(tokenUrl, params);
  }

  async passwordGrant({ tokenUrl, clientId, clientSecret, username, password, scope }) {
    if (!clientId) throw new Error('clientId is required');
    const params = new URLSearchParams();
    params.set('grant_type', 'password');
    params.set('client_id', clientId);
    if (clientSecret) params.set('client_secret', clientSecret);
    params.set('username', username || '');
    params.set('password', password || '');
    if (scope) params.set('scope', scope);
    return this.postTokenEndpoint(tokenUrl, params);
  }

  async authorizationCodeGrant(parentWindow, config) {
    const { authUrl, tokenUrl, clientId, clientSecret, callbackUrl, scope, usePkce } = config;
    if (!authUrl) throw new Error('authUrl is required for authorization_code grant');
    if (!clientId) throw new Error('clientId is required');
    if (!callbackUrl) throw new Error('callbackUrl (redirect URI) is required for authorization_code grant');

    // PKCE: required by public clients (no clientSecret) and recommended otherwise
    let codeVerifier = null;
    let codeChallenge = null;
    if (usePkce !== false) {
      codeVerifier = base64UrlEncode(crypto.randomBytes(32));
      codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
    }

    const state = base64UrlEncode(crypto.randomBytes(16));

    // Build authorization URL
    const authRequestUrl = new URL(authUrl);
    authRequestUrl.searchParams.set('response_type', 'code');
    authRequestUrl.searchParams.set('client_id', clientId);
    authRequestUrl.searchParams.set('redirect_uri', callbackUrl);
    if (scope) authRequestUrl.searchParams.set('scope', scope);
    authRequestUrl.searchParams.set('state', state);
    if (codeChallenge) {
      authRequestUrl.searchParams.set('code_challenge', codeChallenge);
      authRequestUrl.searchParams.set('code_challenge_method', 'S256');
    }

    // Drive the user through the auth UI in a popup and capture the code
    const code = await this.captureAuthorizationCode(
      parentWindow,
      authRequestUrl.toString(),
      callbackUrl,
      state,
    );

    // Exchange code for tokens
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('client_id', clientId);
    params.set('redirect_uri', callbackUrl);
    if (clientSecret) params.set('client_secret', clientSecret);
    if (codeVerifier) params.set('code_verifier', codeVerifier);
    return this.postTokenEndpoint(tokenUrl, params);
  }

  /**
   * Open a BrowserWindow loading the auth URL, intercept the redirect to
   * `callbackUrl`, extract `code`, validate `state`, return the code.
   */
  captureAuthorizationCode(parentWindow, authRequestUrl, callbackUrl, expectedState) {
    return new Promise((resolve, reject) => {
      const win = new BrowserWindow({
        width: 600,
        height: 750,
        parent: parentWindow || undefined,
        modal: false,
        autoHideMenuBar: true,
        title: 'Sign in',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      let settled = false;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        fn();
        if (!win.isDestroyed()) win.close();
      };

      const handleNavigation = (event, url) => {
        if (!url || !url.startsWith(callbackUrl)) return;
        event.preventDefault();
        try {
          const u = new URL(url);
          const code = u.searchParams.get('code');
          const error = u.searchParams.get('error');
          const errorDesc = u.searchParams.get('error_description');
          const state = u.searchParams.get('state');
          if (error) {
            finish(() => reject(new Error(`Authorization denied: ${error}${errorDesc ? ` - ${errorDesc}` : ''}`)));
            return;
          }
          if (state !== expectedState) {
            finish(() => reject(new Error('Authorization state mismatch (possible CSRF)')));
            return;
          }
          if (!code) {
            finish(() => reject(new Error('No authorization code in callback URL')));
            return;
          }
          finish(() => resolve(code));
        } catch (e) {
          finish(() => reject(e));
        }
      };

      win.webContents.on('will-redirect', handleNavigation);
      win.webContents.on('will-navigate', handleNavigation);
      win.on('closed', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Authorization window closed before completion'));
        }
      });

      win.loadURL(authRequestUrl).catch((e) => finish(() => reject(e)));
    });
  }

  /**
   * POST application/x-www-form-urlencoded body to the token endpoint.
   * Resolves with the parsed JSON response on 2xx, rejects with a descriptive
   * Error on non-2xx (using error_description / error from the body when present).
   */
  postTokenEndpoint(tokenUrl, params) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(tokenUrl);
      } catch (e) {
        reject(new Error(`Invalid tokenUrl: ${tokenUrl}`));
        return;
      }
      const body = params.toString();
      const lib = parsed.protocol === 'https:' ? https : http;

      const req = lib.request(
        {
          method: 'POST',
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            Accept: 'application/json',
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let data;
            try {
              data = JSON.parse(text);
            } catch {
              data = { raw: text };
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              const desc = data.error_description || data.error || data.raw || `HTTP ${res.statusCode}`;
              reject(new Error(`Token endpoint returned ${res.statusCode}: ${desc}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

module.exports = { OAuth2Service };

class HttpClient {
  constructor() {
    this.timeout = 30000; // 30 seconds
  }

  async execute(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const startTime = performance.now();

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers || {},
        body: request.body || undefined,
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects
      });

      const elapsed = Math.round(performance.now() - startTime);
      const body = await response.text();

      // Extract headers
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Extract cookies from Set-Cookie header
      const cookies = this.parseCookies(response.headers.getSetCookie?.() || []);

      // Build sent request info
      const sentHeaders = { ...request.headers };

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers,
        body,
        size: body.length,
        time: elapsed,
        cookies,
        sentRequest: {
          method: request.method,
          url: request.url,
          headers: sentHeaders,
          body: request.body || '',
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  parseCookies(setCookieHeaders) {
    return setCookieHeaders.map((header) => {
      const parts = header.split(';').map((p) => p.trim());
      const [nameValue, ...attributes] = parts;
      const [name, value] = nameValue.split('=');

      const cookie = {
        name,
        value: value || '',
        domain: '',
        path: '',
        expires: '',
        httpOnly: false,
        secure: false,
      };

      for (const attr of attributes) {
        const [attrName, attrValue] = attr.split('=');
        const lowerName = attrName.toLowerCase();

        if (lowerName === 'domain') {
          cookie.domain = attrValue || '';
        } else if (lowerName === 'path') {
          cookie.path = attrValue || '';
        } else if (lowerName === 'expires') {
          cookie.expires = attrValue || '';
        } else if (lowerName === 'httponly') {
          cookie.httpOnly = true;
        } else if (lowerName === 'secure') {
          cookie.secure = true;
        }
      }

      return cookie;
    });
  }
}

module.exports = { HttpClient };

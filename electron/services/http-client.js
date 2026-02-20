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

      // Extract headers
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Parse content type and determine encoding
      const contentTypeHeader = response.headers.get('content-type') || '';
      const contentType = this.parseContentType(contentTypeHeader);

      // Read response as arrayBuffer to handle both text and binary
      const buffer = await response.arrayBuffer();

      let body, bodyEncoding, size;
      if (this.isTextContent(contentType)) {
        body = new TextDecoder(contentType.charset || 'utf-8').decode(buffer);
        bodyEncoding = 'text';
        size = body.length;
      } else {
        body = Buffer.from(buffer).toString('base64');
        bodyEncoding = 'base64';
        size = buffer.byteLength;
      }

      // Extract cookies from Set-Cookie header
      const cookies = this.parseCookies(response.headers.getSetCookie?.() || []);

      // Build sent request info
      const sentHeaders = { ...request.headers };

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers,
        body,
        bodyEncoding,
        size,
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

  parseContentType(header) {
    if (!header) return { type: '', subtype: '', charset: null };

    const parts = header.split(';').map((p) => p.trim());
    const [mimeType, ...params] = parts;
    const [type, subtype] = mimeType.split('/');

    let charset = null;
    for (const param of params) {
      const [key, value] = param.split('=').map((s) => s.trim());
      if (key.toLowerCase() === 'charset') {
        charset = value.replace(/['"]/g, '');
      }
    }

    return { type: type || '', subtype: subtype || '', charset };
  }

  isTextContent(contentType) {
    const { type, subtype } = contentType;

    // Text types
    if (type === 'text') return true;

    // JSON
    if (type === 'application' && subtype === 'json') return true;
    if (subtype.endsWith('+json')) return true;

    // XML
    if (type === 'application' && subtype === 'xml') return true;
    if (subtype.endsWith('+xml')) return true;

    // Other common text application types
    if (type === 'application') {
      const textSubtypes = [
        'javascript',
        'x-javascript',
        'ecmascript',
        'x-www-form-urlencoded',
      ];
      if (textSubtypes.includes(subtype)) return true;
    }

    return false;
  }

  parseCookies(setCookieHeaders) {
    return setCookieHeaders.map((header) => {
      const parts = header.split(';').map((p) => p.trim());
      const [nameValue, ...attributes] = parts;

      // Split on first '=' only to preserve base64 and other values containing '='
      const eqIdx = nameValue.indexOf('=');
      const name = eqIdx === -1 ? nameValue : nameValue.substring(0, eqIdx);
      const value = eqIdx === -1 ? '' : nameValue.substring(eqIdx + 1);

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
        // Split on first '=' only for attribute values too
        const attrEqIdx = attr.indexOf('=');
        const attrName = attrEqIdx === -1 ? attr : attr.substring(0, attrEqIdx);
        const attrValue = attrEqIdx === -1 ? '' : attr.substring(attrEqIdx + 1);
        const lowerName = attrName.trim().toLowerCase();

        if (lowerName === 'domain') {
          cookie.domain = attrValue || '';
        } else if (lowerName === 'path') {
          cookie.path = attrValue || '';
        } else if (lowerName === 'expires') {
          cookie.expires = attrValue || '';
        } else if (lowerName === 'max-age') {
          // Convert max-age to expires date
          const maxAge = parseInt(attrValue, 10);
          if (!isNaN(maxAge)) {
            if (maxAge <= 0) {
              cookie.expires = new Date(0).toUTCString();
            } else {
              cookie.expires = new Date(Date.now() + maxAge * 1000).toUTCString();
            }
          }
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

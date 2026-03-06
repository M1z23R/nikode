const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class HttpClient {
  constructor() {
    this.timeout = 30000; // 30 seconds
  }

  async execute(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const startTime = performance.now();

    try {
      let body = request.body;
      let headers = { ...request.headers };

      // Handle form-data entries (multipart/form-data with file support)
      if (request.formDataEntries && request.formDataEntries.length > 0) {
        const { body: multipartBody, contentType } = this.buildMultipartBody(request.formDataEntries);
        body = multipartBody;
        headers['Content-Type'] = contentType;
      }

      const response = await fetch(request.url, {
        method: request.method,
        headers: headers,
        body: body || undefined,
        signal: controller.signal,
        redirect: 'manual', // Don't follow redirects
      });

      const elapsed = Math.round(performance.now() - startTime);

      // Extract response headers
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Parse content type and determine encoding
      const contentTypeHeader = response.headers.get('content-type') || '';
      const contentType = this.parseContentType(contentTypeHeader);

      // Read response as arrayBuffer to handle both text and binary
      const buffer = await response.arrayBuffer();

      let responseBody, bodyEncoding, size;
      if (this.isTextContent(contentType)) {
        responseBody = new TextDecoder(contentType.charset || 'utf-8').decode(buffer);
        bodyEncoding = 'text';
        size = responseBody.length;
      } else {
        responseBody = Buffer.from(buffer).toString('base64');
        bodyEncoding = 'base64';
        size = buffer.byteLength;
      }

      // Extract cookies from Set-Cookie header
      const cookies = this.parseCookies(response.headers.getSetCookie?.() || []);

      // Build sent request info (use headers we actually sent)
      const sentBody = typeof body === 'string' ? body : (body ? '[binary data]' : '');

      return {
        statusCode: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        bodyEncoding,
        size,
        time: elapsed,
        cookies,
        sentRequest: {
          method: request.method,
          url: request.url,
          headers,
          body: sentBody,
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

  /**
   * Build multipart/form-data body from structured entries
   * @param {Array<{key: string, type: 'text'|'file', value: string, filePath?: string}>} entries
   * @returns {{body: Buffer, contentType: string}}
   */
  buildMultipartBody(entries) {
    const boundary = '----NikodeBoundary' + crypto.randomUUID().replace(/-/g, '');
    const parts = [];

    for (const entry of entries) {
      if (entry.type === 'file' && entry.filePath) {
        // Read file from disk
        const fileBuffer = fs.readFileSync(entry.filePath);
        const fileName = path.basename(entry.filePath);
        const mimeType = this.getMimeType(entry.filePath);

        parts.push(Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${entry.key}"; filename="${fileName}"\r\n` +
          `Content-Type: ${mimeType}\r\n\r\n`
        ));
        parts.push(fileBuffer);
        parts.push(Buffer.from('\r\n'));
      } else {
        // Text field
        parts.push(Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${entry.key}"\r\n\r\n` +
          `${entry.value}\r\n`
        ));
      }
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      body: Buffer.concat(parts),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  /**
   * Get MIME type from file extension
   * @param {string} filePath
   * @returns {string}
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.rar': 'application/vnd.rar',
      '.7z': 'application/x-7z-compressed',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = { HttpClient };

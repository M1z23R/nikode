import { describe, it, expect } from 'vitest';
import { generateCurl, parseCurl, ParsedCurl } from './curl';
import { ProxyRequest } from '../models/request.model';

describe('curl', () => {
  describe('generateCurl', () => {
    it('should generate a simple GET request', () => {
      const request: ProxyRequest = {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {},
      };
      const result = generateCurl(request);
      expect(result).toBe("curl \\\n  'https://api.example.com/users'");
    });

    it('should include method for non-GET requests', () => {
      const request: ProxyRequest = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {},
      };
      const result = generateCurl(request);
      expect(result).toContain('-X POST');
    });

    it('should include headers', () => {
      const request: ProxyRequest = {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
      };
      const result = generateCurl(request);
      expect(result).toContain("-H 'Content-Type: application/json'");
      expect(result).toContain("-H 'Authorization: Bearer token123'");
    });

    it('should include body data', () => {
      const request: ProxyRequest = {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {},
        body: '{"name": "John"}',
      };
      const result = generateCurl(request);
      expect(result).toContain("-d '{\"name\": \"John\"}'");
    });

    it('should escape single quotes in URL', () => {
      const request: ProxyRequest = {
        method: 'GET',
        url: "https://api.example.com/search?q=it's",
        headers: {},
      };
      const result = generateCurl(request);
      expect(result).toContain("'https://api.example.com/search?q=it'\\''s'");
    });

    it('should escape single quotes in headers', () => {
      const request: ProxyRequest = {
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          'X-Custom': "value with 'quotes'",
        },
      };
      const result = generateCurl(request);
      expect(result).toContain("'X-Custom: value with '\\''quotes'\\'''");
    });

    it('should escape single quotes in body', () => {
      const request: ProxyRequest = {
        method: 'POST',
        url: 'https://api.example.com',
        headers: {},
        body: "it's a test",
      };
      const result = generateCurl(request);
      expect(result).toContain("-d 'it'\\''s a test'");
    });
  });

  describe('parseCurl', () => {
    describe('basic parsing', () => {
      it('should parse a simple GET request', () => {
        const result = parseCurl('curl https://api.example.com/users');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('GET');
          expect(result.data.url).toBe('https://api.example.com/users');
        }
      });

      it('should parse URL in single quotes', () => {
        const result = parseCurl("curl 'https://api.example.com/users'");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.url).toBe('https://api.example.com/users');
        }
      });

      it('should parse URL in double quotes', () => {
        const result = parseCurl('curl "https://api.example.com/users"');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.url).toBe('https://api.example.com/users');
        }
      });

      it('should fail if command does not start with curl', () => {
        const result = parseCurl('wget https://example.com');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('must start with "curl"');
        }
      });

      it('should fail if no URL is provided', () => {
        const result = parseCurl('curl -X POST');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('No URL found');
        }
      });
    });

    describe('method parsing', () => {
      it('should parse -X method', () => {
        const result = parseCurl('curl -X POST https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('POST');
        }
      });

      it('should parse --request method', () => {
        const result = parseCurl('curl --request PUT https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('PUT');
        }
      });

      it('should handle lowercase method and convert to uppercase', () => {
        const result = parseCurl('curl -X post https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('POST');
        }
      });

      it('should fail on invalid HTTP method', () => {
        const result = parseCurl('curl -X INVALID https://api.example.com');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Invalid HTTP method');
        }
      });

      it('should fail if method is missing after -X', () => {
        const result = parseCurl('curl -X');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Missing method');
        }
      });
    });

    describe('header parsing', () => {
      it('should parse -H header', () => {
        const result = parseCurl(
          "curl -H 'Content-Type: application/json' https://api.example.com"
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.headers).toContainEqual({
            key: 'Content-Type',
            value: 'application/json',
            enabled: true,
          });
        }
      });

      it('should parse --header', () => {
        const result = parseCurl(
          'curl --header "Authorization: Bearer token" https://api.example.com'
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.headers).toContainEqual({
            key: 'Authorization',
            value: 'Bearer token',
            enabled: true,
          });
        }
      });

      it('should parse multiple headers', () => {
        const result = parseCurl(
          "curl -H 'Content-Type: application/json' -H 'Accept: application/json' https://api.example.com"
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.headers).toHaveLength(2);
        }
      });

      it('should fail if header value is missing after -H', () => {
        const result = parseCurl('curl -H');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Missing header');
        }
      });
    });

    describe('body parsing', () => {
      it('should parse -d body data', () => {
        const result = parseCurl("curl -d '{\"name\": \"John\"}' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body).toEqual({
            type: 'json',
            content: '{"name": "John"}',
          });
        }
      });

      it('should parse --data body', () => {
        const result = parseCurl('curl --data "test data" https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body).toEqual({
            type: 'raw',
            content: 'test data',
          });
        }
      });

      it('should parse --data-raw body', () => {
        const result = parseCurl('curl --data-raw "raw data" https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body).toEqual({
            type: 'raw',
            content: 'raw data',
          });
        }
      });

      it('should detect JSON body by content', () => {
        const result = parseCurl("curl -d '[1, 2, 3]' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.type).toBe('json');
        }
      });

      it('should default to POST when body is present', () => {
        const result = parseCurl("curl -d 'data' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('POST');
        }
      });

      it('should keep explicit method when body is present', () => {
        const result = parseCurl("curl -X PUT -d 'data' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('PUT');
        }
      });

      it('should fail if data is missing after -d', () => {
        const result = parseCurl('curl -d');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Missing data');
        }
      });
    });

    describe('form data parsing', () => {
      it('should parse -F form data', () => {
        const result = parseCurl("curl -F 'name=John' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body).toEqual({
            type: 'form-data',
            entries: [{ key: 'name', value: 'John', enabled: true }],
          });
        }
      });

      it('should parse --form data', () => {
        const result = parseCurl("curl --form 'field=value' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.type).toBe('form-data');
        }
      });

      it('should parse multiple form fields', () => {
        const result = parseCurl(
          "curl -F 'name=John' -F 'age=30' https://api.example.com"
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body.type).toBe('form-data');
          if (result.data.body.type === 'form-data') {
            expect(result.data.body.entries).toHaveLength(2);
          }
        }
      });

      it('should handle file references in form data', () => {
        const result = parseCurl("curl -F 'file=@/path/to/file.txt' https://api.example.com");
        expect(result.success).toBe(true);
        if (result.success && result.data.body.type === 'form-data') {
          expect(result.data.body.entries[0].value).toBe('/path/to/file.txt');
        }
      });
    });

    describe('URL-encoded data parsing', () => {
      it('should parse --data-urlencode', () => {
        const result = parseCurl(
          'curl --data-urlencode "name=John Doe" https://api.example.com'
        );
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.body).toEqual({
            type: 'x-www-form-urlencoded',
            entries: [{ key: 'name', value: 'John Doe', enabled: true }],
          });
        }
      });

      it('should handle --data-urlencode without value', () => {
        const result = parseCurl('curl --data-urlencode "key" https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success && result.data.body.type === 'x-www-form-urlencoded') {
          expect(result.data.body.entries[0]).toEqual({
            key: 'key',
            value: '',
            enabled: true,
          });
        }
      });
    });

    describe('query parameter extraction', () => {
      it('should extract query params from URL', () => {
        const result = parseCurl('curl "https://api.example.com/search?q=test&page=1"');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.url).toBe('https://api.example.com/search');
          expect(result.data.params).toContainEqual({
            key: 'q',
            value: 'test',
            enabled: true,
          });
          expect(result.data.params).toContainEqual({
            key: 'page',
            value: '1',
            enabled: true,
          });
        }
      });

      it('should handle URL without query params', () => {
        const result = parseCurl('curl https://api.example.com/users');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.params).toEqual([]);
        }
      });
    });

    describe('line continuation and whitespace', () => {
      it('should handle line continuations', () => {
        const command = `curl \\
          -X POST \\
          -H 'Content-Type: application/json' \\
          https://api.example.com/users`;
        const result = parseCurl(command);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('POST');
          expect(result.data.url).toBe('https://api.example.com/users');
        }
      });

      it('should normalize multiple whitespaces', () => {
        const result = parseCurl('curl    -X   POST    https://api.example.com');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.method).toBe('POST');
        }
      });
    });

    describe('ignored flags', () => {
      it('should ignore -o flag with value', () => {
        const result = parseCurl('curl -o output.txt https://api.example.com/data');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.url).toBe('https://api.example.com/data');
        }
      });

      it('should ignore -u flag with value', () => {
        const result = parseCurl('curl -u user:pass https://api.example.com/auth');
        expect(result.success).toBe(true);
      });

      it('should ignore boolean flags', () => {
        const result = parseCurl('curl -k -v -L https://api.example.com/api');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.url).toBe('https://api.example.com/api');
        }
      });
    });

    describe('case sensitivity', () => {
      it('should handle uppercase CURL', () => {
        const result = parseCurl('CURL https://api.example.com');
        expect(result.success).toBe(true);
      });

      it('should handle mixed case Curl', () => {
        const result = parseCurl('Curl https://api.example.com');
        expect(result.success).toBe(true);
      });
    });
  });
});

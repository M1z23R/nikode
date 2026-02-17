import { describe, it, expect, beforeEach } from 'vitest';
import { OpenApiConverter } from './openapi-converter.js';

describe('OpenApiConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new OpenApiConverter();
  });

  describe('extractBaseUrl', () => {
    it('should extract base URL from OpenAPI 3.x servers array', () => {
      const api = {
        servers: [{ url: 'https://api.example.com/v1' }],
      };
      expect(converter.extractBaseUrl(api)).toBe('https://api.example.com/v1');
    });

    it('should use first server when multiple are provided', () => {
      const api = {
        servers: [
          { url: 'https://prod.example.com' },
          { url: 'https://staging.example.com' },
        ],
      };
      expect(converter.extractBaseUrl(api)).toBe('https://prod.example.com');
    });

    it('should extract base URL from Swagger 2.0 host and basePath', () => {
      const api = {
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['https'],
      };
      expect(converter.extractBaseUrl(api)).toBe('https://api.example.com/v2');
    });

    it('should default to https for Swagger 2.0 without schemes', () => {
      const api = {
        host: 'api.example.com',
        basePath: '/v1',
      };
      expect(converter.extractBaseUrl(api)).toBe('https://api.example.com/v1');
    });

    it('should return default URL when no servers or host defined', () => {
      expect(converter.extractBaseUrl({})).toBe('http://localhost:3000');
    });

    it('should handle empty servers array', () => {
      const api = { servers: [] };
      expect(converter.extractBaseUrl(api)).toBe('http://localhost:3000');
    });
  });

  describe('slugify', () => {
    it('should convert string to lowercase slug', () => {
      expect(converter.slugify('Hello World')).toBe('hello-world');
    });

    it('should replace special characters with hyphens', () => {
      expect(converter.slugify('Get /users/{id}')).toBe('get-users-id');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(converter.slugify('--test--')).toBe('test');
    });

    it('should truncate to 50 characters', () => {
      const longString = 'a'.repeat(100);
      expect(converter.slugify(longString).length).toBe(50);
    });

    it('should handle empty string', () => {
      expect(converter.slugify('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(converter.slugify(null)).toBe('');
      expect(converter.slugify(undefined)).toBe('');
    });
  });

  describe('generateExampleFromSchema', () => {
    it('should use example value when provided', () => {
      const schema = { type: 'string', example: 'test-value' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe('test-value');
    });

    it('should use default value when no example', () => {
      const schema = { type: 'string', default: 'default-value' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe('default-value');
    });

    it('should generate string example', () => {
      const schema = { type: 'string' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe('string');
    });

    it('should use first enum value for string enum', () => {
      const schema = { type: 'string', enum: ['active', 'inactive'] };
      expect(converter.generateExampleFromSchema(schema, {})).toBe('active');
    });

    it('should generate number example', () => {
      const schema = { type: 'number' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe(0);
    });

    it('should generate integer example', () => {
      const schema = { type: 'integer' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe(0);
    });

    it('should generate boolean example', () => {
      const schema = { type: 'boolean' };
      expect(converter.generateExampleFromSchema(schema, {})).toBe(false);
    });

    it('should generate object example with properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      };
      expect(converter.generateExampleFromSchema(schema, {})).toEqual({
        name: 'string',
        age: 0,
      });
    });

    it('should generate array example', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
      };
      expect(converter.generateExampleFromSchema(schema, {})).toEqual(['string']);
    });

    it('should resolve $ref schemas', () => {
      const schema = { $ref: '#/components/schemas/User' };
      const api = {
        components: {
          schemas: {
            User: { type: 'string', example: 'john' },
          },
        },
      };
      expect(converter.generateExampleFromSchema(schema, api)).toBe('john');
    });

    it('should prevent infinite recursion with depth limit', () => {
      const schema = { type: 'object', properties: { nested: { type: 'object' } } };
      // Should not throw, should return null at max depth
      const result = converter.generateExampleFromSchema(schema, {}, 6);
      expect(result).toBeNull();
    });

    it('should handle null schema', () => {
      expect(converter.generateExampleFromSchema(null, {})).toBeNull();
    });
  });

  describe('schemaToFormEntries', () => {
    it('should convert object schema to form entries', () => {
      const schema = {
        type: 'object',
        properties: {
          username: { type: 'string', example: 'john' },
          password: { type: 'string' },
        },
        required: ['username'],
      };
      const entries = converter.schemaToFormEntries(schema, {});
      expect(entries).toContainEqual({ key: 'username', value: 'john', enabled: true });
      expect(entries).toContainEqual({ key: 'password', value: '', enabled: false });
      // Should have empty row at end
      expect(entries[entries.length - 1]).toEqual({ key: '', value: '', enabled: true });
    });

    it('should return empty entry for non-object schema', () => {
      const schema = { type: 'string' };
      expect(converter.schemaToFormEntries(schema, {})).toEqual([
        { key: '', value: '', enabled: true },
      ]);
    });

    it('should handle null schema', () => {
      expect(converter.schemaToFormEntries(null, {})).toEqual([
        { key: '', value: '', enabled: true },
      ]);
    });
  });

  describe('convertRequestBody', () => {
    it('should return none for operation without requestBody', () => {
      expect(converter.convertRequestBody({}, {})).toEqual({ type: 'none' });
    });

    it('should convert JSON request body', () => {
      const operation = {
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } } },
            },
          },
        },
      };
      const result = converter.convertRequestBody(operation, {});
      expect(result.type).toBe('json');
      expect(JSON.parse(result.content)).toEqual({ name: 'string' });
    });

    it('should use example from JSON body when provided', () => {
      const operation = {
        requestBody: {
          content: {
            'application/json': {
              example: { id: 123, name: 'Test' },
            },
          },
        },
      };
      const result = converter.convertRequestBody(operation, {});
      expect(result.type).toBe('json');
      expect(JSON.parse(result.content)).toEqual({ id: 123, name: 'Test' });
    });

    it('should convert multipart/form-data', () => {
      const operation = {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string' } },
              },
            },
          },
        },
      };
      const result = converter.convertRequestBody(operation, {});
      expect(result.type).toBe('form-data');
      expect(result.entries).toBeDefined();
    });

    it('should convert x-www-form-urlencoded', () => {
      const operation = {
        requestBody: {
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: { grant_type: { type: 'string' } },
              },
            },
          },
        },
      };
      const result = converter.convertRequestBody(operation, {});
      expect(result.type).toBe('x-www-form-urlencoded');
    });

    it('should default to raw for unknown content types', () => {
      const operation = {
        requestBody: {
          content: {
            'text/plain': {},
          },
        },
      };
      const result = converter.convertRequestBody(operation, {});
      expect(result.type).toBe('raw');
    });
  });

  describe('convertOperationToRequest', () => {
    it('should convert basic operation to request', () => {
      const operation = {
        summary: 'Get User',
        operationId: 'getUser',
        description: 'Retrieves a user by ID',
      };
      const request = converter.convertOperationToRequest('/users/{id}', 'get', operation, {});

      expect(request.type).toBe('request');
      expect(request.name).toBe('Get User');
      expect(request.method).toBe('GET');
      expect(request.url).toBe('{{baseUrl}}/users/{{id}}');
      expect(request.docs).toBe('Retrieves a user by ID');
    });

    it('should convert path parameters from {param} to {{param}}', () => {
      const operation = {};
      const request = converter.convertOperationToRequest(
        '/users/{userId}/posts/{postId}',
        'get',
        operation,
        {}
      );
      expect(request.url).toBe('{{baseUrl}}/users/{{userId}}/posts/{{postId}}');
    });

    it('should extract query parameters', () => {
      const operation = {
        parameters: [
          { name: 'page', in: 'query', example: '1', required: false },
          { name: 'limit', in: 'query', schema: { default: '10' }, required: true },
        ],
      };
      const request = converter.convertOperationToRequest('/users', 'get', operation, {});

      expect(request.params).toContainEqual({ key: 'page', value: '1', enabled: false });
      expect(request.params).toContainEqual({ key: 'limit', value: '10', enabled: true });
    });

    it('should extract header parameters', () => {
      const operation = {
        parameters: [{ name: 'X-Custom-Header', in: 'header', required: true }],
      };
      const request = converter.convertOperationToRequest('/test', 'get', operation, {});

      expect(request.headers).toContainEqual({
        key: 'X-Custom-Header',
        value: '',
        enabled: true,
      });
    });

    it('should include path-level parameters', () => {
      const operation = {};
      const api = {
        paths: {
          '/users': {
            parameters: [{ name: 'api-version', in: 'header' }],
          },
        },
      };
      const request = converter.convertOperationToRequest('/users', 'get', operation, api);
      expect(request.headers.some((h) => h.key === 'api-version')).toBe(true);
    });

    it('should always include User-Agent header', () => {
      const request = converter.convertOperationToRequest('/test', 'get', {}, {});
      expect(request.headers).toContainEqual({
        key: 'User-Agent',
        value: 'Nikode/1.0',
        enabled: true,
      });
    });

    it('should initialize scripts with empty strings', () => {
      const request = converter.convertOperationToRequest('/test', 'get', {}, {});
      expect(request.scripts).toEqual({ pre: '', post: '' });
    });

    it('should generate unique IDs', () => {
      const request1 = converter.convertOperationToRequest('/test', 'get', {}, {});
      const request2 = converter.convertOperationToRequest('/test', 'get', {}, {});
      expect(request1.id).not.toBe(request2.id);
    });
  });

  describe('convertPathsToItems', () => {
    it('should group operations by first tag into folders', () => {
      const api = {
        paths: {
          '/users': {
            get: { tags: ['Users'], summary: 'List Users' },
            post: { tags: ['Users'], summary: 'Create User' },
          },
          '/posts': {
            get: { tags: ['Posts'], summary: 'List Posts' },
          },
        },
      };
      const items = converter.convertPathsToItems(api);

      expect(items.length).toBe(2);
      expect(items.find((i) => i.name === 'Users')).toBeDefined();
      expect(items.find((i) => i.name === 'Posts')).toBeDefined();

      const usersFolder = items.find((i) => i.name === 'Users');
      expect(usersFolder.type).toBe('folder');
      expect(usersFolder.items.length).toBe(2);
    });

    it('should place untagged operations at root level', () => {
      const api = {
        paths: {
          '/health': {
            get: { summary: 'Health Check' },
          },
          '/users': {
            get: { tags: ['Users'], summary: 'List Users' },
          },
        },
      };
      const items = converter.convertPathsToItems(api);

      const healthRequest = items.find((i) => i.type === 'request' && i.name === 'Health Check');
      expect(healthRequest).toBeDefined();
    });

    it('should handle all HTTP methods', () => {
      const api = {
        paths: {
          '/resource': {
            get: { summary: 'GET' },
            post: { summary: 'POST' },
            put: { summary: 'PUT' },
            patch: { summary: 'PATCH' },
            delete: { summary: 'DELETE' },
            head: { summary: 'HEAD' },
            options: { summary: 'OPTIONS' },
          },
        },
      };
      const items = converter.convertPathsToItems(api);
      expect(items.length).toBe(7);
    });

    it('should handle empty paths', () => {
      const api = { paths: {} };
      expect(converter.convertPathsToItems(api)).toEqual([]);
    });

    it('should handle undefined paths', () => {
      expect(converter.convertPathsToItems({})).toEqual([]);
    });
  });

  describe('exportToOpenApi', () => {
    it('should export basic collection to OpenAPI 3.0.3', () => {
      const collection = {
        name: 'Test API',
        version: '2.0.0',
        environments: [
          {
            id: 'env-1',
            variables: [{ key: 'baseUrl', value: 'https://api.test.com' }],
          },
        ],
        activeEnvironmentId: 'env-1',
        items: [],
      };

      const spec = converter.exportToOpenApi(collection);

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Test API');
      expect(spec.info.version).toBe('2.0.0');
      expect(spec.servers[0].url).toBe('https://api.test.com');
    });

    it('should convert requests to paths', () => {
      const collection = {
        name: 'Test',
        environments: [
          {
            id: 'default',
            variables: [{ key: 'baseUrl', value: 'http://localhost' }],
          },
        ],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'request',
            name: 'Get Users',
            method: 'GET',
            url: '{{baseUrl}}/users',
            params: [],
            headers: [],
            body: { type: 'none' },
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      expect(spec.paths['/users']).toBeDefined();
      expect(spec.paths['/users'].get).toBeDefined();
      expect(spec.paths['/users'].get.summary).toBe('Get Users');
    });

    it('should convert folders to tags', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'folder',
            name: 'Users',
            items: [
              {
                type: 'request',
                name: 'List Users',
                method: 'GET',
                url: '{{baseUrl}}/users',
              },
            ],
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      expect(spec.tags).toContainEqual({ name: 'Users' });
      expect(spec.paths['/users'].get.tags).toContain('Users');
    });

    it('should convert {{variable}} back to {variable} in paths', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'request',
            name: 'Get User',
            method: 'GET',
            url: '{{baseUrl}}/users/{{id}}',
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      expect(spec.paths['/users/{id}']).toBeDefined();
    });

    it('should export query parameters', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'request',
            name: 'Search',
            method: 'GET',
            url: '{{baseUrl}}/search',
            params: [{ key: 'q', value: 'test' }],
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      const params = spec.paths['/search'].get.parameters;
      expect(params).toContainEqual(
        expect.objectContaining({ name: 'q', in: 'query', example: 'test' })
      );
    });

    it('should export JSON body', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'request',
            name: 'Create User',
            method: 'POST',
            url: '{{baseUrl}}/users',
            body: { type: 'json', content: '{"name": "John"}' },
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      const requestBody = spec.paths['/users'].post.requestBody;
      expect(requestBody.content['application/json']).toBeDefined();
      expect(requestBody.content['application/json'].example).toEqual({ name: 'John' });
    });

    it('should strip query string from path', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [
          {
            type: 'request',
            name: 'Test',
            method: 'GET',
            url: '{{baseUrl}}/test?foo=bar',
          },
        ],
      };

      const spec = converter.exportToOpenApi(collection);
      expect(spec.paths['/test']).toBeDefined();
      expect(spec.paths['/test?foo=bar']).toBeUndefined();
    });

    it('should use default baseUrl when not found in environment', () => {
      const collection = {
        name: 'Test',
        environments: [{ id: 'default', variables: [] }],
        activeEnvironmentId: 'default',
        items: [],
      };

      const spec = converter.exportToOpenApi(collection);
      expect(spec.servers[0].url).toBe('http://localhost:3000');
    });
  });

  describe('convertNikodeBodyToOpenApi', () => {
    it('should convert JSON body', () => {
      const body = { type: 'json', content: '{"key": "value"}' };
      const result = converter.convertNikodeBodyToOpenApi(body);
      expect(result.content['application/json'].example).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON in body content', () => {
      const body = { type: 'json', content: 'not valid json' };
      const result = converter.convertNikodeBodyToOpenApi(body);
      expect(result.content['application/json'].example).toBe('not valid json');
    });

    it('should convert form-data body', () => {
      const body = {
        type: 'form-data',
        entries: [{ key: 'file', value: '' }],
      };
      const result = converter.convertNikodeBodyToOpenApi(body);
      expect(result.content['multipart/form-data']).toBeDefined();
    });

    it('should convert x-www-form-urlencoded body', () => {
      const body = {
        type: 'x-www-form-urlencoded',
        entries: [{ key: 'username', value: 'test' }],
      };
      const result = converter.convertNikodeBodyToOpenApi(body);
      expect(result.content['application/x-www-form-urlencoded']).toBeDefined();
    });

    it('should convert raw body', () => {
      const body = { type: 'raw', content: 'plain text' };
      const result = converter.convertNikodeBodyToOpenApi(body);
      expect(result.content['text/plain'].example).toBe('plain text');
    });

    it('should return undefined for none body type', () => {
      const body = { type: 'none' };
      expect(converter.convertNikodeBodyToOpenApi(body)).toBeUndefined();
    });
  });

  describe('entriesToSchema', () => {
    it('should convert entries to OpenAPI schema', () => {
      const entries = [
        { key: 'name', value: 'John' },
        { key: 'email', value: 'john@example.com' },
      ];
      const schema = converter.entriesToSchema(entries);

      expect(schema.type).toBe('object');
      expect(schema.properties.name).toEqual({ type: 'string', example: 'John' });
      expect(schema.properties.email).toEqual({ type: 'string', example: 'john@example.com' });
    });

    it('should skip entries with empty keys', () => {
      const entries = [
        { key: 'name', value: 'John' },
        { key: '', value: '' },
      ];
      const schema = converter.entriesToSchema(entries);
      expect(Object.keys(schema.properties)).toEqual(['name']);
    });

    it('should handle empty entries array', () => {
      const schema = converter.entriesToSchema([]);
      expect(schema).toEqual({ type: 'object', properties: {} });
    });

    it('should handle undefined entries', () => {
      const schema = converter.entriesToSchema(undefined);
      expect(schema).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('tryParseJson', () => {
    it('should parse valid JSON', () => {
      expect(converter.tryParseJson('{"key": "value"}')).toEqual({ key: 'value' });
    });

    it('should return original string for invalid JSON', () => {
      expect(converter.tryParseJson('not json')).toBe('not json');
    });
  });
});

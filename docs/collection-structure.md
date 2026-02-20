# Nikode Collection Structure

This document describes the data structure used by Nikode for organizing API collections, and how to convert OpenAPI specifications to this format.

## Overview

A Nikode Collection is a hierarchical structure that organizes API requests, WebSocket connections, and GraphQL queries into folders with environment-based variable management.

## Core Structure

### Collection (Root)

```typescript
interface Collection {
  name: string;                    // Collection name (e.g., "My API")
  version: string;                 // Version string (e.g., "1.0.0")
  environments: Environment[];     // List of environments
  activeEnvironmentId: string;     // Currently active environment ID
  items: CollectionItem[];         // Root-level items (folders + requests)
}
```

### Hierarchy Diagram

```
Collection
├── environments: Environment[]
│   ├── { id: "env-default", name: "Default", variables: [...] }
│   └── { id: "env-prod", name: "Production", variables: [...] }
│
└── items: CollectionItem[]
    ├── { type: "folder", name: "Users" }
    │   └── items: CollectionItem[]
    │       ├── { type: "request", name: "Get User", method: "GET" }
    │       ├── { type: "request", name: "Create User", method: "POST" }
    │       └── { type: "folder", name: "Admin" }  ← nested folders allowed
    │           └── items: [...]
    │
    ├── { type: "request", name: "Health Check", method: "GET" }
    ├── { type: "websocket", name: "Live Updates" }
    └── { type: "graphql", name: "Query Users" }
```

## Item Types

### CollectionItem (Polymorphic)

A single `CollectionItem` interface covers all item types. The `type` field determines which optional fields are relevant.

```typescript
interface CollectionItem {
  id: string;                              // Unique identifier (e.g., "req-1234-abcde")
  type: 'folder' | 'request' | 'websocket' | 'graphql';
  name: string;                            // Display name

  // Folder-specific
  items?: CollectionItem[];                // Children (recursive)

  // HTTP Request-specific
  method?: HttpMethod;                     // GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
  url?: string;                            // URL with variable support: "{{baseUrl}}/users/{{id}}"
  params?: KeyValue[];                     // Query parameters
  headers?: KeyValue[];                    // HTTP headers
  body?: RequestBody;                      // Request body
  scripts?: Scripts;                       // Pre/post request scripts
  docs?: string;                           // Documentation/notes

  // WebSocket-specific
  wsProtocols?: string[];                  // WebSocket sub-protocols
  wsAutoReconnect?: boolean;               // Auto-reconnect on disconnect
  wsReconnectInterval?: number;            // Reconnect interval in ms
  wsSavedMessages?: WebSocketSavedMessage[];

  // GraphQL-specific
  gqlQuery?: string;                       // GraphQL query/mutation
  gqlVariables?: string;                   // JSON string of variables
  gqlOperationName?: string;               // Operation name
}
```

### ID Conventions

IDs follow a deterministic prefix pattern:
- Folders: `folder-{slug}-{timestamp}`
- HTTP Requests: `req-{slug}-{timestamp}-{random}`
- WebSocket: `ws-{slug}-{timestamp}-{random}`
- GraphQL: `gql-{slug}-{timestamp}-{random}`

## Supporting Types

### KeyValue

Used for headers, query parameters, and form entries.

```typescript
interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;    // Whether included in requests
}
```

### RequestBody

```typescript
interface RequestBody {
  type: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
  content?: string;      // For json, raw, binary (base64 for binary)
  entries?: KeyValue[];  // For form-data and x-www-form-urlencoded
}
```

### Scripts

Pre/post request JavaScript hooks.

```typescript
interface Scripts {
  pre: string;   // Runs before the request
  post: string;  // Runs after the response
}
```

### HttpMethod

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
```

## Environment Variables

### Environment

```typescript
interface Environment {
  id: string;              // Unique identifier (e.g., "env-default")
  name: string;            // Display name (e.g., "Production")
  variables: Variable[];   // Environment variables
}
```

### Variable

```typescript
interface Variable {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;   // If true, stored in OS keychain (not in collection file)
}
```

Variables are referenced in URLs, headers, and body content using double curly braces: `{{variableName}}`.

## Example Collection

```json
{
  "name": "Pet Store API",
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-default",
      "name": "Development",
      "variables": [
        { "key": "baseUrl", "value": "http://localhost:3000", "enabled": true },
        { "key": "apiKey", "value": "dev-key-123", "enabled": true, "secret": true }
      ]
    },
    {
      "id": "env-prod",
      "name": "Production",
      "variables": [
        { "key": "baseUrl", "value": "https://api.petstore.com", "enabled": true },
        { "key": "apiKey", "value": "", "enabled": true, "secret": true }
      ]
    }
  ],
  "activeEnvironmentId": "env-default",
  "items": [
    {
      "id": "folder-pets-1234",
      "type": "folder",
      "name": "Pets",
      "items": [
        {
          "id": "req-list-pets-1234-abc",
          "type": "request",
          "name": "List Pets",
          "method": "GET",
          "url": "{{baseUrl}}/pets",
          "params": [
            { "key": "limit", "value": "10", "enabled": true },
            { "key": "offset", "value": "0", "enabled": false }
          ],
          "headers": [
            { "key": "Authorization", "value": "Bearer {{apiKey}}", "enabled": true }
          ],
          "body": { "type": "none" },
          "scripts": { "pre": "", "post": "" },
          "docs": "Returns a list of all pets"
        },
        {
          "id": "req-create-pet-1234-def",
          "type": "request",
          "name": "Create Pet",
          "method": "POST",
          "url": "{{baseUrl}}/pets",
          "params": [],
          "headers": [
            { "key": "Authorization", "value": "Bearer {{apiKey}}", "enabled": true },
            { "key": "Content-Type", "value": "application/json", "enabled": true }
          ],
          "body": {
            "type": "json",
            "content": "{\n  \"name\": \"Fluffy\",\n  \"species\": \"cat\"\n}"
          },
          "scripts": { "pre": "", "post": "" },
          "docs": "Creates a new pet"
        }
      ]
    },
    {
      "id": "ws-live-updates-1234",
      "type": "websocket",
      "name": "Live Updates",
      "url": "{{baseUrl}}/ws",
      "headers": [],
      "wsProtocols": [],
      "wsAutoReconnect": true,
      "wsReconnectInterval": 5000,
      "wsSavedMessages": [
        { "id": "msg-1", "name": "Subscribe", "type": "text", "content": "{\"action\":\"subscribe\"}" }
      ]
    }
  ]
}
```

---

## OpenAPI to Nikode Conversion

The conversion from OpenAPI/Swagger specifications to Nikode collections follows these rules:

### Mapping Overview

| OpenAPI | Nikode |
|---------|--------|
| `info.title` | `collection.name` |
| `info.version` | `collection.version` |
| `servers[0].url` | `environments[0].variables.baseUrl` |
| `tags` | Folders |
| `paths[path][method]` | Request items |
| `parameters` (query) | `request.params` |
| `parameters` (header) | `request.headers` |
| `parameters` (path) | URL template variables `{{param}}` |
| `requestBody` | `request.body` |
| `summary` | `request.name` |
| `description` | `request.docs` |

### Path Parameter Conversion

OpenAPI path parameters `{id}` are converted to Nikode template variables `{{id}}`:

```
OpenAPI:  /users/{userId}/posts/{postId}
Nikode:   {{baseUrl}}/users/{{userId}}/posts/{{postId}}
```

### Tag-Based Folder Organization

Operations are grouped into folders by their first tag:

```yaml
# OpenAPI
paths:
  /pets:
    get:
      tags: [Pets]
      summary: List pets
  /users:
    get:
      tags: [Users]
      summary: List users
```

```
# Nikode
├── Pets/
│   └── List pets (GET)
└── Users/
    └── List users (GET)
```

Untagged operations are placed at the root level.

### Request Body Mapping

| OpenAPI Content-Type | Nikode Body Type |
|---------------------|------------------|
| `application/json` | `json` |
| `multipart/form-data` | `form-data` |
| `application/x-www-form-urlencoded` | `x-www-form-urlencoded` |
| `text/plain` | `raw` |
| Other | `raw` |

### Example Generation

The converter generates example values from:
1. `example` field on schema
2. `default` field on schema
3. Type-based defaults (`string` → "string", `integer` → 0, `boolean` → false)
4. Recursive object/array traversal

### Conversion Code

The full OpenAPI converter is located at: `electron/services/openapi-converter.js`

#### Key Functions

**Import OpenAPI to Nikode:**
```javascript
async importFromOpenApi(specPath) {
  const api = await SwaggerParser.validate(specPath);

  return {
    name: api.info?.title || 'Imported API',
    version: api.info?.version || '1.0.0',
    environments: [{
      id: 'env-default',
      name: 'default',
      variables: [
        { key: 'baseUrl', value: extractBaseUrl(api), enabled: true }
      ]
    }],
    activeEnvironmentId: 'env-default',
    items: convertPathsToItems(api)
  };
}
```

**Convert Operation to Request:**
```javascript
convertOperationToRequest(pathStr, method, operation, api) {
  const url = '{{baseUrl}}' + pathStr.replace(/\{([^}]+)\}/g, '{{$1}}');

  return {
    id: `req-${slugify(operation.operationId)}-${Date.now()}`,
    type: 'request',
    name: operation.summary || `${method.toUpperCase()} ${pathStr}`,
    method: method.toUpperCase(),
    url,
    params: extractQueryParams(operation),
    headers: extractHeaders(operation),
    body: convertRequestBody(operation),
    scripts: { pre: '', post: '' },
    docs: operation.description || ''
  };
}
```

**Export Nikode to OpenAPI:**
```javascript
exportToOpenApi(collection) {
  return {
    openapi: '3.0.3',
    info: {
      title: collection.name,
      version: collection.version
    },
    servers: [{ url: getBaseUrl(collection) }],
    paths: collectPathsFromItems(collection.items),
    tags: extractTagsFromFolders(collection.items)
  };
}
```

---

## File Format

Nikode collections are stored as JSON or YAML files with the extension `.nikode.json` or `.nikode.yaml`.

### Detection

The file format detector distinguishes between:
- `nikode` - Native Nikode format
- `openapi` - OpenAPI/Swagger specification
- `postman` - Postman collection v2.x
- `postman-env` - Postman environment file

Detection is based on presence of format-specific keys:
- Nikode: has `items` array and `environments` array
- OpenAPI: has `openapi` or `swagger` key
- Postman: has `info._postman_id` or `info.schema` containing "postman"

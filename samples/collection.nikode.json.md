# Nikode Collection Format Reference

This document describes the `.nikode.json` file format. Use this reference to create API collections.

## Root Structure

```json
{
  "name": "Collection Name",
  "version": "1.0.0",
  "environments": [],
  "activeEnvironmentId": "env-id",
  "items": []
}
```

## Environments

Environments store variables for different contexts (sandbox, production, etc.).

```json
{
  "id": "env-sandbox",
  "name": "Sandbox",
  "variables": [
    { "key": "baseUrl", "value": "https://api.sandbox.example.com", "enabled": true },
    { "key": "apiKey", "value": "sk_test_xxx", "enabled": true, "secret": true }
  ]
}
```

- `secret: true` - Value stored in OS keychain, not in JSON file
- Variables are referenced using `{{variableName}}` syntax in URLs, headers, and bodies

## Items (Folders & Requests)

Items can be `folder`, `request`, `websocket`, or `graphql`. Folders can nest items recursively.

### Folder

```json
{
  "id": "folder-payments",
  "type": "folder",
  "name": "Payments",
  "items": []
}
```

### HTTP Request

```json
{
  "id": "req-create-payment",
  "type": "request",
  "name": "Create Payment",
  "method": "POST",
  "url": "{{baseUrl}}/v1/payments",
  "params": [
    { "key": "expand[]", "value": "customer", "enabled": true }
  ],
  "headers": [
    { "key": "Content-Type", "value": "application/json", "enabled": true },
    { "key": "Idempotency-Key", "value": "{{$uuid}}", "enabled": true }
  ],
  "body": {
    "type": "json",
    "content": "{\n  \"amount\": 1000,\n  \"currency\": \"usd\"\n}"
  },
  "auth": {
    "type": "bearer",
    "bearer": { "token": "{{apiKey}}", "prefix": "Bearer" }
  },
  "scripts": {
    "pre": "",
    "post": "nk.test('Success', () => {\n  nk.assert(nk.response.statusCode === 200);\n});"
  },
  "docs": "Creates a new payment intent"
}
```

#### Methods

`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

#### Body Types

**None:**
```json
{ "type": "none" }
```

**JSON:**
```json
{
  "type": "json",
  "content": "{\n  \"key\": \"value\"\n}"
}
```

**Form URL-encoded:**
```json
{
  "type": "x-www-form-urlencoded",
  "entries": [
    { "key": "grant_type", "value": "client_credentials", "enabled": true }
  ]
}
```

**Form Data (multipart):**
```json
{
  "type": "form-data",
  "entries": [
    { "key": "file", "value": "/path/to/file", "enabled": true }
  ]
}
```

**Raw:**
```json
{
  "type": "raw",
  "content": "raw text content"
}
```

## Authentication Types

### None
```json
{ "type": "none" }
```

### Basic Auth
```json
{
  "type": "basic",
  "basic": {
    "username": "{{clientId}}",
    "password": "{{clientSecret}}"
  }
}
```

### Bearer Token
```json
{
  "type": "bearer",
  "bearer": {
    "token": "{{accessToken}}",
    "prefix": "Bearer"
  }
}
```

### API Key
```json
{
  "type": "api-key",
  "apiKey": {
    "key": "X-API-Key",
    "value": "{{apiKey}}",
    "addTo": "header"
  }
}
```

`addTo` can be `"header"` or `"query"`.

### OAuth2

```json
{
  "type": "oauth2",
  "oauth2": {
    "grantType": "client_credentials",
    "accessToken": "{{accessToken}}",
    "tokenUrl": "{{baseUrl}}/oauth/token",
    "authUrl": "{{baseUrl}}/oauth/authorize",
    "clientId": "{{clientId}}",
    "clientSecret": "{{clientSecret}}",
    "scope": "read write",
    "callbackUrl": "http://localhost:3000/callback",
    "username": "",
    "password": ""
  }
}
```

Grant types: `client_credentials`, `password`, `authorization_code`

## Scripts

Scripts run before (`pre`) and after (`post`) requests. The `nk` object provides:

- `nk.response.statusCode` - HTTP status code
- `nk.response.body` - Response body as string
- `nk.response.headers` - Response headers object
- `nk.getVar(key)` - Get environment variable
- `nk.setVar(key, value)` - Set environment variable (persists to environment)
- `nk.test(name, fn)` - Create a test assertion
- `nk.assert(condition, message)` - Assert a condition

### Common Script Patterns

**Extract and save token:**
```javascript
const body = JSON.parse(nk.response.body);
nk.setVar('accessToken', body.access_token);
```

**Extract ID for chaining:**
```javascript
const body = JSON.parse(nk.response.body);
nk.setVar('orderId', body.id);
```

**Validate response:**
```javascript
nk.test('Returns 200', () => {
  nk.assert(nk.response.statusCode === 200, 'Expected 200');
});

nk.test('Has required fields', () => {
  const body = JSON.parse(nk.response.body);
  nk.assert(body.id, 'Missing id');
  nk.assert(body.status, 'Missing status');
});
```

## WebSocket Request

```json
{
  "id": "ws-realtime",
  "type": "websocket",
  "name": "Realtime Events",
  "url": "wss://{{baseUrl}}/ws",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "wsProtocols": [],
  "wsAutoReconnect": true,
  "wsReconnectInterval": 5000,
  "wsSavedMessages": [
    {
      "id": "msg-subscribe",
      "name": "Subscribe",
      "type": "text",
      "content": "{\"action\": \"subscribe\", \"channel\": \"updates\"}"
    }
  ]
}
```

## GraphQL Request

```json
{
  "id": "gql-query",
  "type": "graphql",
  "name": "Get Users",
  "url": "{{baseUrl}}/graphql",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "gqlQuery": "query GetUsers($limit: Int) {\n  users(limit: $limit) {\n    id\n    name\n  }\n}",
  "gqlVariables": "{\"limit\": 10}",
  "gqlOperationName": "GetUsers"
}
```

## Complete Example

```json
{
  "name": "Example API",
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-sandbox",
      "name": "Sandbox",
      "variables": [
        { "key": "baseUrl", "value": "https://api.sandbox.example.com", "enabled": true },
        { "key": "clientId", "value": "your-client-id", "enabled": true },
        { "key": "clientSecret", "value": "", "enabled": true, "secret": true },
        { "key": "accessToken", "value": "", "enabled": true, "secret": true }
      ]
    },
    {
      "id": "env-production",
      "name": "Production",
      "variables": [
        { "key": "baseUrl", "value": "https://api.example.com", "enabled": true },
        { "key": "clientId", "value": "your-client-id", "enabled": true },
        { "key": "clientSecret", "value": "", "enabled": true, "secret": true },
        { "key": "accessToken", "value": "", "enabled": true, "secret": true }
      ]
    }
  ],
  "activeEnvironmentId": "env-sandbox",
  "items": [
    {
      "id": "folder-auth",
      "type": "folder",
      "name": "Authentication",
      "items": [
        {
          "id": "req-get-token",
          "type": "request",
          "name": "Get Access Token",
          "method": "POST",
          "url": "{{baseUrl}}/oauth/token",
          "params": [],
          "headers": [
            { "key": "Content-Type", "value": "application/x-www-form-urlencoded", "enabled": true }
          ],
          "body": {
            "type": "x-www-form-urlencoded",
            "entries": [
              { "key": "grant_type", "value": "client_credentials", "enabled": true },
              { "key": "client_id", "value": "{{clientId}}", "enabled": true },
              { "key": "client_secret", "value": "{{clientSecret}}", "enabled": true }
            ]
          },
          "auth": { "type": "none" },
          "scripts": {
            "pre": "",
            "post": "const body = JSON.parse(nk.response.body);\nif (body.access_token) {\n  nk.setVar('accessToken', body.access_token);\n}\n\nnk.test('Token received', () => {\n  nk.assert(body.access_token, 'No access token in response');\n});"
          },
          "docs": "Obtains an access token using client credentials. Token is automatically saved to environment."
        }
      ]
    },
    {
      "id": "folder-resources",
      "type": "folder",
      "name": "Resources",
      "items": [
        {
          "id": "req-list-resources",
          "type": "request",
          "name": "List Resources",
          "method": "GET",
          "url": "{{baseUrl}}/v1/resources",
          "params": [
            { "key": "limit", "value": "10", "enabled": true },
            { "key": "offset", "value": "0", "enabled": false }
          ],
          "headers": [],
          "body": { "type": "none" },
          "auth": {
            "type": "bearer",
            "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" }
          },
          "scripts": { "pre": "", "post": "" },
          "docs": ""
        },
        {
          "id": "req-create-resource",
          "type": "request",
          "name": "Create Resource",
          "method": "POST",
          "url": "{{baseUrl}}/v1/resources",
          "params": [],
          "headers": [
            { "key": "Content-Type", "value": "application/json", "enabled": true }
          ],
          "body": {
            "type": "json",
            "content": "{\n  \"name\": \"My Resource\",\n  \"description\": \"Resource description\"\n}"
          },
          "auth": {
            "type": "bearer",
            "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" }
          },
          "scripts": {
            "pre": "",
            "post": "const body = JSON.parse(nk.response.body);\nif (body.id) {\n  nk.setVar('resourceId', body.id);\n}"
          },
          "docs": "Creates a new resource. ID is saved to resourceId variable."
        },
        {
          "id": "req-get-resource",
          "type": "request",
          "name": "Get Resource",
          "method": "GET",
          "url": "{{baseUrl}}/v1/resources/{{resourceId}}",
          "params": [],
          "headers": [],
          "body": { "type": "none" },
          "auth": {
            "type": "bearer",
            "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" }
          },
          "scripts": { "pre": "", "post": "" },
          "docs": "Retrieves a resource by ID. Uses resourceId from environment."
        }
      ]
    }
  ]
}
```

## ID Conventions

Use descriptive prefixes for IDs:
- Environments: `env-sandbox`, `env-production`
- Folders: `folder-auth`, `folder-payments`
- Requests: `req-create-order`, `req-get-token`
- WebSocket: `ws-realtime`, `ws-notifications`
- GraphQL: `gql-query-users`, `gql-mutation-create`
- Messages: `msg-subscribe`, `msg-ping`

## File Extension

Save files as `.nikode.json` (e.g., `stripe.nikode.json`, `paypal.nikode.json`).

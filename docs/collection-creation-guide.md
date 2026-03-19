# Nikode Collection Creation Guide

Guide for AI agents generating Nikode collection files (`.nikode.json`).

## Minimal Collection

```json
{
  "name": "My API",
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-default",
      "name": "Default",
      "variables": [
        { "key": "baseUrl", "value": "https://api.example.com", "enabled": true }
      ]
    }
  ],
  "activeEnvironmentId": "env-default",
  "items": []
}
```

All five root fields are required.

## Items

Items go in the `items` array. Each item has `id`, `type`, and `name`. The `type` determines which other fields apply.

### Folders

Folders group items. They nest recursively.

```json
{
  "id": "folder-users-1710000000000",
  "type": "folder",
  "name": "Users",
  "items": [ /* requests or more folders */ ]
}
```

### HTTP Requests

```json
{
  "id": "req-get-users-1710000000000-abc",
  "type": "request",
  "name": "Get Users",
  "method": "GET",
  "url": "{{baseUrl}}/users",
  "params": [
    { "key": "limit", "value": "10", "enabled": true }
  ],
  "headers": [
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "body": { "type": "none" },
  "scripts": { "pre": "", "post": "" },
  "docs": "Returns a list of users"
}
```

**Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

### ID Format

Use deterministic prefixes: `folder-{slug}-{timestamp}`, `req-{slug}-{timestamp}-{random}`, `ws-{slug}-{timestamp}-{random}`, `gql-{slug}-{timestamp}-{random}`. IDs must be unique within the collection.

## Body Types

| `type` | Data field | Use case |
|--------|-----------|----------|
| `none` | - | GET, DELETE |
| `json` | `content` (JSON string) | JSON APIs |
| `raw` | `content` (plain text) | Text, XML, etc. |
| `form-data` | `formDataEntries` | File uploads, multipart |
| `x-www-form-urlencoded` | `entries` | HTML form style |
| `binary` | `content` (base64) | Binary files |

**JSON body example:**
```json
{
  "type": "json",
  "content": "{\n  \"name\": \"John\",\n  \"email\": \"john@example.com\"\n}"
}
```

**Form-urlencoded example:**
```json
{
  "type": "x-www-form-urlencoded",
  "entries": [
    { "key": "username", "value": "john", "enabled": true },
    { "key": "password", "value": "{{password}}", "enabled": true }
  ]
}
```

## Variables

Reference variables anywhere in URLs, headers, params, and body using `{{variableName}}`.

```json
"environments": [
  {
    "id": "env-dev",
    "name": "Development",
    "variables": [
      { "key": "baseUrl", "value": "http://localhost:3000", "enabled": true },
      { "key": "apiKey", "value": "dev-key", "enabled": true, "secret": true }
    ]
  },
  {
    "id": "env-prod",
    "name": "Production",
    "variables": [
      { "key": "baseUrl", "value": "https://api.example.com", "enabled": true },
      { "key": "apiKey", "value": "", "enabled": true, "secret": true }
    ]
  }
]
```

Set `"secret": true` for sensitive values (API keys, passwords, tokens). These are stored separately from the collection file.

## Authentication

Add `auth` to any request. Omit or use `"type": "none"` for no auth.

```json
// Bearer token
{ "type": "bearer", "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" } }

// Basic auth
{ "type": "basic", "basic": { "username": "{{user}}", "password": "{{pass}}" } }

// API key
{ "type": "api-key", "apiKey": { "key": "X-API-Key", "value": "{{apiKey}}", "addTo": "header" } }

// OAuth2
{
  "type": "oauth2",
  "oauth2": {
    "grantType": "client_credentials",
    "accessToken": "",
    "tokenUrl": "https://auth.example.com/token",
    "authUrl": "https://auth.example.com/authorize",
    "clientId": "{{clientId}}",
    "clientSecret": "{{clientSecret}}",
    "username": "",
    "password": "",
    "callbackUrl": "http://localhost:3000/callback",
    "scope": "read write"
  }
}
```

## Scripts

Scripts are JavaScript strings on the `scripts` object. `pre` runs before the request, `post` runs after.

### Script API (`nk.*`)

| Function | Available in | Description |
|----------|-------------|-------------|
| `nk.getEnv(key)` / `nk.getVar(key)` | pre, post | Get environment variable |
| `nk.setEnv(key, value)` / `nk.setVar(key, value)` | pre, post | Set environment variable (persists) |
| `nk.request.url` | pre, post | Request URL |
| `nk.request.method` | pre, post | HTTP method |
| `nk.request.headers` | pre, post | Request headers object |
| `nk.request.body` | pre, post | Request body |
| `nk.response.statusCode` | post | HTTP status code |
| `nk.response.statusText` | post | Status text |
| `nk.response.headers` | post | Response headers |
| `nk.response.body` | post | Response body string |
| `nk.response.time` | post | Response time (ms) |
| `nk.response.size` | post | Response size (bytes) |
| `nk.test(name, fn)` | post | Define a test |
| `nk.assert(condition, msg)` | post | Assert condition |
| `console.log(...)` | pre, post | Log to console |

### Script Examples

**Pre-request** - set a dynamic header:
```javascript
nk.setVar('timestamp', Date.now().toString());
console.log('Requesting:', nk.request.url);
```

**Post-request** - test and extract data:
```javascript
nk.test('Login successful', () => {
  nk.assert(nk.response.statusCode === 200, 'Expected 200');
  const body = JSON.parse(nk.response.body);
  nk.assert(body.token, 'Missing token');
  nk.setVar('accessToken', body.token);
});
```

## Complete Example

A small collection with auth flow and CRUD:

```json
{
  "name": "Task Manager API",
  "version": "1.0.0",
  "environments": [
    {
      "id": "env-dev",
      "name": "Development",
      "variables": [
        { "key": "baseUrl", "value": "http://localhost:4000", "enabled": true },
        { "key": "accessToken", "value": "", "enabled": true, "secret": true }
      ]
    }
  ],
  "activeEnvironmentId": "env-dev",
  "items": [
    {
      "id": "req-login-1710000000000-a1b",
      "type": "request",
      "name": "Login",
      "method": "POST",
      "url": "{{baseUrl}}/auth/login",
      "params": [],
      "headers": [
        { "key": "Content-Type", "value": "application/json", "enabled": true }
      ],
      "body": {
        "type": "json",
        "content": "{\n  \"email\": \"user@example.com\",\n  \"password\": \"password123\"\n}"
      },
      "scripts": {
        "pre": "",
        "post": "nk.test('Login works', () => {\n  nk.assert(nk.response.statusCode === 200);\n  const body = JSON.parse(nk.response.body);\n  nk.setVar('accessToken', body.token);\n});"
      }
    },
    {
      "id": "folder-tasks-1710000000000",
      "type": "folder",
      "name": "Tasks",
      "items": [
        {
          "id": "req-list-tasks-1710000000000-b2c",
          "type": "request",
          "name": "List Tasks",
          "method": "GET",
          "url": "{{baseUrl}}/tasks",
          "params": [],
          "headers": [],
          "body": { "type": "none" },
          "auth": { "type": "bearer", "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" } },
          "scripts": { "pre": "", "post": "" }
        },
        {
          "id": "req-create-task-1710000000000-c3d",
          "type": "request",
          "name": "Create Task",
          "method": "POST",
          "url": "{{baseUrl}}/tasks",
          "params": [],
          "headers": [
            { "key": "Content-Type", "value": "application/json", "enabled": true }
          ],
          "body": {
            "type": "json",
            "content": "{\n  \"title\": \"New Task\",\n  \"completed\": false\n}"
          },
          "auth": { "type": "bearer", "bearer": { "token": "{{accessToken}}", "prefix": "Bearer" } },
          "scripts": {
            "pre": "",
            "post": "nk.test('Task created', () => {\n  nk.assert(nk.response.statusCode === 201);\n});"
          }
        }
      ]
    }
  ]
}
```

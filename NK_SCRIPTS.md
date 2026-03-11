# NK Scripts Reference

NK Scripts are JavaScript code blocks that run before (pre-request) and after (post-response) HTTP requests. All scripting functionality is accessed through the `nk` namespace object.

## Script Types

| Type | Runs | Has `nk.response` |
|------|------|--------------------|
| **Pre-request** | Before the HTTP request is sent | No |
| **Post-response** | After the response is received | Yes |

Scripts are stored in the collection file under each request's `scripts` property:

```json
{
  "scripts": {
    "pre": "// runs before request",
    "post": "// runs after response"
  }
}
```

---

## nk.request

Read-only object available in **both** pre and post scripts.

| Property | Type | Description |
|----------|------|-------------|
| `nk.request.method` | `string` | HTTP method (`GET`, `POST`, etc.) |
| `nk.request.url` | `string` | Resolved request URL |
| `nk.request.headers` | `Record<string, string>` | Request headers |
| `nk.request.body` | `string \| undefined` | Request body |

```javascript
console.log('Sending', nk.request.method, 'to', nk.request.url);
```

---

## nk.response

Read-only object available **only in post-response scripts**.

| Property | Type | Description |
|----------|------|-------------|
| `nk.response.statusCode` | `number` | HTTP status code |
| `nk.response.statusText` | `string` | HTTP status text |
| `nk.response.headers` | `Record<string, string>` | Response headers |
| `nk.response.body` | `string` | Response body as string |
| `nk.response.time` | `number` | Response time in milliseconds |
| `nk.response.size` | `number` | Response size in bytes |

```javascript
const data = JSON.parse(nk.response.body);
console.log('Status:', nk.response.statusCode, '- Time:', nk.response.time, 'ms');
```

---

## Environment Variables

Persist across requests and are saved to the active environment.

| Method | Signature | Description |
|--------|-----------|-------------|
| `nk.getEnv` | `(key: string) => string \| undefined` | Get an environment variable |
| `nk.setEnv` | `(key: string, value: string) => void` | Set/create an environment variable (persists) |

```javascript
// Post-response: extract and save a token
const body = JSON.parse(nk.response.body);
nk.setEnv('accessToken', body.access_token);

// Pre-request: read a saved value
const token = nk.getEnv('accessToken');
console.log('Using token:', token);
```

If the variable already exists in the active environment, its value is updated. If it doesn't exist, a new variable is created. Secret variables update their value in the OS keychain.

---

## Request-Scoped Variables

Temporary variables that only live for the duration of a single request execution.

| Method | Signature | Description |
|--------|-----------|-------------|
| `nk.getVar` | `(key: string) => string \| undefined` | Get a request-scoped variable |
| `nk.setVar` | `(key: string, value: string) => void` | Set a request-scoped variable |

```javascript
// Pre-request: set a timestamp
nk.setVar('startTime', Date.now().toString());

// Post-response: read it back
const start = parseInt(nk.getVar('startTime'));
```

Request variables are cleared after the request completes. Use `nk.setEnv` / `nk.getEnv` for values that should persist.

---

## Testing & Assertions

Define named tests with assertion logic. Results appear in the test results panel and console.

| Method | Signature | Description |
|--------|-----------|-------------|
| `nk.test` | `(name: string, fn: () => void) => void` | Define a named test |
| `nk.assert` | `(condition: boolean, message?: string) => void` | Assert a condition (throws if false) |

```javascript
nk.test('Status is 200', () => {
  nk.assert(nk.response.statusCode === 200);
});

nk.test('Response has required fields', () => {
  const body = JSON.parse(nk.response.body);
  nk.assert(body.id, 'Missing id');
  nk.assert(body.name, 'Missing name');
  nk.assert(body.email, 'Missing email');
});

nk.test('Response time is acceptable', () => {
  nk.assert(nk.response.time < 1000, 'Response took longer than 1s');
});
```

When `nk.assert` fails inside a `nk.test` block, the test is marked as failed with the error message. Multiple tests can be defined in a single script.

---

## Cookie Management

Manage cookies for the current collection.

| Method | Signature | Description |
|--------|-----------|-------------|
| `nk.getCookie` | `(name: string) => string \| undefined` | Get a cookie value by name |
| `nk.getCookies` | `() => Array<{ name, value, domain, path }>` | Get all cookies |
| `nk.setCookie` | `(name: string, value: string, domain?: string, path?: string) => void` | Set or update a cookie |
| `nk.clearCookies` | `() => void` | Clear all cookies |

```javascript
// Read a session cookie
const session = nk.getCookie('sessionId');

// Set a custom cookie
nk.setCookie('debug', 'true', 'api.example.com', '/');

// List all cookies
const cookies = nk.getCookies();
cookies.forEach(c => console.log(c.name, '=', c.value));

// Clear everything
nk.clearCookies();
```

---

## Schema Validation

Validate response data against JSON schemas. Schemas can be defined inline or stored by name in the collection.

| Method | Signature | Description |
|--------|-----------|-------------|
| `nk.getSchema` | `(name: string) => object \| undefined` | Retrieve a stored schema by name (parsed) |
| `nk.validateSchema` | `(data: any, schema: object \| string, type?: SchemaType) => { valid: boolean, errors: string[] }` | Validate data against a schema |

### Using a stored schema (by name)

```javascript
const body = JSON.parse(nk.response.body);
const result = nk.validateSchema(body, 'UserSchema');

nk.test('Matches UserSchema', () => {
  nk.assert(result.valid, result.errors.join(', '));
});
```

### Using an inline schema

```javascript
const body = JSON.parse(nk.response.body);
const result = nk.validateSchema(body, {
  type: 'object',
  required: ['id', 'name', 'email'],
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' }
  }
});

nk.test('Valid response shape', () => {
  nk.assert(result.valid, result.errors.join(', '));
});
```

### SchemaType constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SchemaType.JSON` | `"json"` | JSON Schema validation (default) |
| `SchemaType.XML` | `"xml"` | XML Schema validation (not yet supported) |

---

## Polling Control

When a request has polling enabled, scripts can access the iteration index and stop polling programmatically.

| Property/Method | Type | Description |
|-----------------|------|-------------|
| `nk.iteration` | `number` | Current polling iteration index (0-based) |
| `nk.stopPolling` | `() => void` | Stop the polling loop after the current iteration |

```javascript
console.log('Polling iteration:', nk.iteration);

const body = JSON.parse(nk.response.body);
if (body.status === 'completed') {
  console.log('Job finished, stopping poll');
  nk.stopPolling();
}
```

---

## Console Logging

Standard console methods are available. Output appears in Nikode's console panel.

| Method | Description |
|--------|-------------|
| `console.log(...args)` | Log info message |
| `console.warn(...args)` | Log warning message |
| `console.error(...args)` | Log error message |

```javascript
console.log('Request URL:', nk.request.url);
console.warn('Token expires soon');
console.error('Unexpected status:', nk.response.statusCode);
```

Objects are automatically JSON-stringified in the output.

---

## Variable Substitution

Outside of scripts, Nikode supports `{{variable}}` syntax in URLs, headers, query params, and request bodies. These are resolved before the request is sent.

| Syntax | Description |
|--------|-------------|
| `{{variableName}}` | Replaced with the environment variable value |
| `{{$uuid}}` | Generates a random UUID |

```
URL:     {{baseUrl}}/api/users/{{userId}}
Header:  Authorization: Bearer {{accessToken}}
Header:  Idempotency-Key: {{$uuid}}
```

Variables set via `nk.setEnv()` in scripts are immediately available for `{{}}` substitution in subsequent requests.

---

## Complete Examples

### Extract and chain tokens

```javascript
// Post-response script on "Login" request
const body = JSON.parse(nk.response.body);

nk.test('Login successful', () => {
  nk.assert(nk.response.statusCode === 200, 'Expected 200');
  nk.assert(body.accessToken, 'Missing accessToken');
});

// Save token for use in subsequent requests via {{accessToken}}
nk.setEnv('accessToken', body.accessToken);
```

### Validate and extract resource ID

```javascript
// Post-response script on "Create Resource" request
nk.test('Resource created', () => {
  nk.assert(nk.response.statusCode === 201, 'Expected 201 Created');
});

const body = JSON.parse(nk.response.body);

nk.test('Has valid structure', () => {
  nk.assert(body.id, 'Missing id');
  nk.assert(body.name, 'Missing name');
});

// Save for use in "Get Resource" request via {{resourceId}}
nk.setEnv('resourceId', body.id.toString());
```

### Poll until job completes

```javascript
// Post-response script with polling enabled
const body = JSON.parse(nk.response.body);

console.log(`[Iteration ${nk.iteration}] Status: ${body.status}`);

if (body.status === 'completed') {
  nk.test('Job completed successfully', () => {
    nk.assert(body.result, 'Missing result');
  });
  nk.setEnv('jobResult', JSON.stringify(body.result));
  nk.stopPolling();
}

if (nk.iteration > 20) {
  console.error('Polling timeout - giving up');
  nk.stopPolling();
}
```

### Pre-request logging

```javascript
// Pre-request script
console.log('Sending', nk.request.method, 'to', nk.request.url);

if (nk.request.body) {
  console.log('Body:', nk.request.body);
}
```

---

## Sandbox

Scripts execute in an isolated sandbox via the JavaScript `Function` constructor. The only globals available are:

- `nk` - The Nikode scripting API
- `console` - Logging proxy (`log`, `warn`, `error`)
- `SchemaType` - Schema type constants (`JSON`, `XML`)

Browser/Node.js globals (`window`, `document`, `require`, `fetch`, etc.) are **not available**.

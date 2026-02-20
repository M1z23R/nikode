# Authentication

Nikode supports built-in authentication for requests via the **Auth** tab in the request editor (between Headers and Body).

## Auth Types

### None

No authentication is applied. This is the default.

### Basic Auth

Sends an `Authorization: Basic <base64(username:password)>` header.

| Field | Description |
|-------|-------------|
| Username | The username |
| Password | The password |

### Bearer Token

Sends an `Authorization: {prefix} {token}` header.

| Field | Description |
|-------|-------------|
| Token | The bearer token value |
| Prefix | Header prefix (default: `Bearer`) |

### API Key

Sends a key-value pair as either a header or a query parameter.

| Field | Description |
|-------|-------------|
| Key | The header or query parameter name |
| Value | The API key value |
| Add To | `Header` or `Query Param` |

### OAuth 2.0

Sends an `Authorization: Bearer {accessToken}` header using a stored access token. Supports three grant types with different fields:

**Client Credentials**

| Field | Description |
|-------|-------------|
| Token URL | Token endpoint |
| Client ID | OAuth client ID |
| Client Secret | OAuth client secret |
| Scope | Space-separated scopes |

**Password**

All Client Credentials fields, plus:

| Field | Description |
|-------|-------------|
| Username | Resource owner username |
| Password | Resource owner password |

**Authorization Code**

All Client Credentials fields, plus:

| Field | Description |
|-------|-------------|
| Auth URL | Authorization endpoint |
| Callback URL | Redirect URI |

Use the **Get Token** button to fetch a token from the Token URL (works for Client Credentials and Password grants). The returned `access_token` is stored in the Access Token field.

## Variable Support

All text fields support `{{variables}}` — type `{{` to see available environment and dynamic variables.

## cURL Import

When importing a cURL command:

- `-u user:pass` / `--user user:pass` is parsed as **Basic Auth**
- `--oauth2-bearer <token>` is parsed as **Bearer Token**

## Persistence

Auth configuration is saved with the request in the collection file and persists across sessions.

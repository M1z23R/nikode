# Nikode API Documentation

Backend API for the Nikode application - a Postman/Bruno-like API client with team collaboration features.

## Base URL

```
http://localhost:8080/api/v1
```

---

## Concepts

### User
A person who authenticates via OAuth (GitHub, GitLab, or Google). Users can:
- Own personal workspaces
- Create and own teams
- Be members of teams (invited by team owners)

### Team
A group of users for collaboration. Teams have:
- **Owner**: The user who created the team (can invite/remove members, delete team)
- **Members**: Users invited by the owner (can access team workspaces)

### Workspace
A container for collections. Can be either:
- **Personal**: Owned by a single user (`user_id` is set, `team_id` is null)
- **Team**: Owned by a team (`team_id` is set, `user_id` is null) - all team members can access

### Collection
The actual nikode.json data stored as JSONB. Contains:
- **name**: Display name for the collection
- **data**: The full nikode.json content (requests, folders, environments, etc.)
- **version**: Auto-incrementing version number for conflict detection

---

## Authentication

### OAuth Flow

1. **Get consent URL** from backend
2. **Redirect user** to OAuth provider (opens in browser)
3. **User authenticates** with provider
4. **Provider redirects** to backend callback
5. **Backend redirects** to Electron app via deep link with tokens

#### Deep Link Format
```
nikode://auth/callback?access_token=<JWT>&refresh_token=<JWT>&expires_in=900
```

On error:
```
nikode://auth/callback?error=<error_message>
```

### Token Usage

Include the access token in all authenticated requests:
```
Authorization: Bearer <access_token>
```

### Token Refresh

Access tokens expire in 15 minutes. Use the refresh token to get new tokens before expiry.

---

## Endpoints

### Authentication

#### Get OAuth Consent URL
```http
GET /auth/:provider/consent
```

**Providers**: `github`, `gitlab`, `google`

**Response** `200 OK`:
```json
{
  "url": "https://github.com/login/oauth/authorize?client_id=...&state=..."
}
```

**Usage**: Open this URL in the user's default browser. After authentication, they'll be redirected back to the app via deep link.

---

#### OAuth Callback (Backend Only)
```http
GET /auth/:provider/callback?code=...&state=...
```

This is called by the OAuth provider, not by your app. It redirects to `nikode://auth/callback`.

---

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200 OK`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 900
}
```

**Note**: The old refresh token is invalidated. Store the new one.

---

#### Logout
```http
POST /auth/logout
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200 OK`:
```json
{
  "message": "logged out"
}
```

---

#### Logout All Sessions
```http
POST /auth/logout-all
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "all sessions logged out"
}
```

Invalidates all refresh tokens for the current user.

---

### Users

#### Get Current User
```http
GET /users/me
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://avatars.githubusercontent.com/u/12345",
  "provider": "github"
}
```

---

#### Update Current User
```http
PATCH /users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "John Smith"
}
```

**Response** `200 OK`: Returns updated user object.

---

### Teams

#### List My Teams
```http
GET /teams
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "My Team",
    "owner_id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "owner"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Another Team",
    "owner_id": "550e8400-e29b-41d4-a716-446655440099",
    "role": "member"
  }
]
```

**Note**: `role` indicates your role in that team.

---

#### Create Team
```http
POST /teams
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "My New Team"
}
```

**Response** `201 Created`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "My New Team",
  "owner_id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "owner"
}
```

---

#### Get Team
```http
GET /teams/:id
Authorization: Bearer <access_token>
```

**Response** `200 OK`: Returns team object.

---

#### Update Team
```http
PATCH /teams/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Renamed Team"
}
```

**Response** `200 OK`: Returns updated team object.

**Note**: Only the owner can update the team.

---

#### Delete Team
```http
DELETE /teams/:id
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "team deleted"
}
```

**Note**: Only the owner can delete. This also deletes all team workspaces and collections.

---

#### List Team Members
```http
GET /teams/:id/members
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
[
  {
    "id": "member-uuid",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "owner",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "owner@example.com",
      "name": "Team Owner",
      "avatar_url": "https://...",
      "provider": "github"
    }
  },
  {
    "id": "member-uuid-2",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "role": "member",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "member@example.com",
      "name": "Team Member",
      "avatar_url": null,
      "provider": "google"
    }
  }
]
```

---

#### Invite Member (by email)
```http
POST /teams/:id/members
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "newmember@example.com"
}
```

**Response** `200 OK`:
```json
{
  "message": "member added"
}
```

**Note**: Only the owner can invite. The user must already have an account (have logged in at least once).

**Errors**:
- `404`: User with this email not found
- `403`: Only owner can invite members

---

#### Remove Member
```http
DELETE /teams/:id/members/:memberId
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "member removed"
}
```

**Note**: `memberId` is the user's UUID, not the membership ID. Only the owner can remove members. Owner cannot remove themselves.

---

#### Leave Team
```http
POST /teams/:id/leave
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "left team"
}
```

**Note**: Owner cannot leave (must delete team or transfer ownership first).

---

### Workspaces

#### List My Workspaces
```http
GET /workspaces
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
[
  {
    "id": "ws-uuid-1",
    "name": "Personal Workspace",
    "user_id": "user-uuid",
    "team_id": null,
    "type": "personal"
  },
  {
    "id": "ws-uuid-2",
    "name": "Team Workspace",
    "user_id": null,
    "team_id": "team-uuid",
    "type": "team"
  }
]
```

Returns all workspaces you have access to (personal + all teams you're a member of).

---

#### Create Workspace
```http
POST /workspaces
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "My Workspace",
  "team_id": null
}
```

**For personal workspace**: Omit `team_id` or set to `null`.

**For team workspace**: Set `team_id` to the team's UUID. You must be a member of that team.

**Response** `201 Created`:
```json
{
  "id": "ws-uuid",
  "name": "My Workspace",
  "user_id": "user-uuid",
  "team_id": null,
  "type": "personal"
}
```

---

#### Get Workspace
```http
GET /workspaces/:workspaceId
Authorization: Bearer <access_token>
```

**Response** `200 OK`: Returns workspace object.

---

#### Update Workspace
```http
PATCH /workspaces/:workspaceId
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Renamed Workspace"
}
```

**Response** `200 OK`: Returns updated workspace object.

**Note**: For personal workspaces, only the owner can update. For team workspaces, only the team owner can update.

---

#### Delete Workspace
```http
DELETE /workspaces/:workspaceId
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "workspace deleted"
}
```

**Note**: This also deletes all collections in the workspace.

---

### Collections

#### List Collections in Workspace
```http
GET /workspaces/:workspaceId/collections
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
[
  {
    "id": "col-uuid-1",
    "workspace_id": "ws-uuid",
    "name": "My API Collection",
    "data": { ... },
    "version": 5,
    "updated_by": "user-uuid"
  }
]
```

---

#### Create Collection
```http
POST /workspaces/:workspaceId/collections
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "New Collection",
  "data": {
    "requests": [],
    "folders": [],
    "environments": []
  }
}
```

**Response** `201 Created`:
```json
{
  "id": "col-uuid",
  "workspace_id": "ws-uuid",
  "name": "New Collection",
  "data": { ... },
  "version": 1,
  "updated_by": "user-uuid"
}
```

**Note**: `data` can be any valid JSON (your nikode.json structure).

---

#### Get Collection
```http
GET /workspaces/:workspaceId/collections/:collectionId
Authorization: Bearer <access_token>
```

**Response** `200 OK`: Returns collection object with full `data`.

---

#### Update Collection
```http
PATCH /workspaces/:workspaceId/collections/:collectionId
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "data": { ... },
  "version": 5
}
```

**IMPORTANT**: You must include the current `version` number. This enables optimistic locking for conflict detection.

**Response** `200 OK`:
```json
{
  "id": "col-uuid",
  "workspace_id": "ws-uuid",
  "name": "Updated Name",
  "data": { ... },
  "version": 6,
  "updated_by": "user-uuid"
}
```

**Version Conflict** `409 Conflict`:
```json
{
  "code": "VERSION_CONFLICT",
  "message": "collection has been modified by another user",
  "current_version": 7
}
```

When you get a version conflict:
1. Fetch the latest collection data
2. Merge changes (your app's conflict resolution logic)
3. Retry update with the new version

---

#### Delete Collection
```http
DELETE /workspaces/:workspaceId/collections/:collectionId
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "collection deleted"
}
```

---

### Real-time Updates (SSE)

Server-Sent Events for live collaboration. When any user updates a collection, all connected clients receive a notification.

#### Connect to Workspace Events
```http
GET /workspaces/:workspaceId/events
Authorization: Bearer <access_token>
Accept: text/event-stream
```

**Connection established** event:
```
event: system
data: {"type":"connected","client_id":"uuid-of-this-connection"}
```

**Collection updated** event:
```
event: message
data: {"type":"collection_updated","data":{"collection_id":"col-uuid","workspace_id":"ws-uuid","version":6,"updated_by":"user-uuid"}}
```

#### Subscribe to Additional Workspaces
```http
POST /sse/:clientId/subscribe/:workspaceId
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "subscribed to workspace ws-uuid"
}
```

Use the `client_id` from the initial connection event.

#### Unsubscribe from Workspace
```http
POST /sse/:clientId/unsubscribe/:workspaceId
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "unsubscribed from workspace ws-uuid"
}
```

---

### Health Check

```http
GET /health
```

**Response** `200 OK`:
```json
{
  "status": "ok"
}
```

No authentication required.

---

## Error Responses

All errors follow this format:

```json
{
  "code": 400,
  "message": "description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Not allowed to perform this action |
| 404 | Not Found - Resource doesn't exist or you don't have access |
| 409 | Conflict - Version conflict on collection update |
| 500 | Internal Server Error |

---

## Electron App Integration Checklist

### 1. Deep Link Setup
Register `nikode://` protocol handler in your Electron app:
```javascript
app.setAsDefaultProtocolClient('nikode')

// Handle the deep link
app.on('open-url', (event, url) => {
  // Parse: nikode://auth/callback?access_token=...&refresh_token=...
  const params = new URL(url).searchParams
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const error = params.get('error')
  // Store tokens, navigate to app
})
```

### 2. Token Storage
Store tokens securely (e.g., `electron-store` with encryption or system keychain).

### 3. Auto-refresh
Set up a timer to refresh tokens before expiry:
```javascript
// expires_in is in seconds
setTimeout(() => refreshTokens(), (expiresIn - 60) * 1000)
```

### 4. SSE Connection
```javascript
const eventSource = new EventSource(
  `${API_URL}/workspaces/${workspaceId}/events`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
)

eventSource.addEventListener('message', (e) => {
  const event = JSON.parse(e.data)
  if (event.type === 'collection_updated') {
    // Someone else updated - fetch latest or show notification
  }
})
```

### 5. Conflict Resolution UI
When you get a 409 on collection update:
- Show diff between local and remote
- Let user choose: keep local, keep remote, or merge

---

## Example: Full Sync Flow

1. User opens app → Load stored tokens
2. Validate token → `GET /users/me`
3. If 401 → Try refresh → If fails, re-authenticate
4. Fetch workspaces → `GET /workspaces`
5. User selects workspace → `GET /workspaces/:id/collections`
6. Connect SSE → `GET /workspaces/:id/events`
7. User edits collection locally
8. On save → `PATCH /workspaces/:id/collections/:id` with current version
9. If 409 conflict → Show conflict resolution UI
10. On SSE event → Fetch latest if version > local version

export interface Collection {
  name: string;
  version: string;
  environments: Environment[];
  activeEnvironmentId: string;
  items: CollectionItem[];
}

export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
}

export interface Variable {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface CollectionItem {
  id: string;
  type: 'folder' | 'request' | 'websocket' | 'graphql';
  name: string;
  items?: CollectionItem[];  // For folders
  method?: HttpMethod;       // For requests
  url?: string;              // For requests, websockets, and graphql
  params?: KeyValue[];       // For requests - URL query parameters
  headers?: KeyValue[];      // For requests, websockets, and graphql
  body?: RequestBody;        // For requests
  scripts?: Scripts;         // For requests
  auth?: RequestAuth;         // For requests - authentication
  docs?: string;             // For requests - documentation/notes
  pollingEnabled?: boolean;
  pollingInterval?: number;      // seconds
  pollingMaxIterations?: number;  // 0 = unlimited
  // WebSocket-specific
  wsProtocols?: string[];
  wsAutoReconnect?: boolean;
  wsReconnectInterval?: number;
  wsSavedMessages?: WebSocketSavedMessage[];
  // GraphQL-specific
  gqlQuery?: string;
  gqlVariables?: string;
  gqlOperationName?: string;
}

export interface WebSocketSavedMessage {
  id: string;
  name: string;
  type: 'text' | 'binary';
  content: string;
}

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  type: 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
  content?: string;
  entries?: KeyValue[];  // For form-data and x-www-form-urlencoded
}

export interface Scripts {
  pre: string;
  post: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type RequestAuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
export type OAuth2GrantType = 'client_credentials' | 'password' | 'authorization_code';
export type ApiKeyLocation = 'header' | 'query';

export interface RequestAuth {
  type: RequestAuthType;
  basic?: { username: string; password: string };
  bearer?: { token: string; prefix: string };
  apiKey?: { key: string; value: string; addTo: ApiKeyLocation };
  oauth2?: {
    grantType: OAuth2GrantType;
    accessToken: string;
    tokenUrl: string;
    authUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    callbackUrl: string;
    scope: string;
  };
}

export interface OpenCollection {
  /** Full file path to the .nikode.json collection file */
  path: string;
  collection: Collection;
  expanded: boolean;
  dirty: boolean;
}

export type CollectionSource = 'local' | 'cloud';

export interface UnifiedCollection {
  id: string;                    // For local: path, for cloud: cloud:workspaceId:collectionId
  source: CollectionSource;
  name: string;
  collection: Collection;
  expanded: boolean;
  dirty: boolean;
  path?: string;                 // Local only
  cloudId?: string;              // Cloud only
  workspaceId?: string;          // Cloud only
  version?: number;              // Cloud only (for conflict detection)
  isReadOnly?: boolean;          // True when offline
}

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
  type: 'folder' | 'request';
  name: string;
  items?: CollectionItem[];  // For folders
  method?: HttpMethod;       // For requests
  url?: string;              // For requests
  params?: KeyValue[];       // For requests - URL query parameters
  headers?: KeyValue[];      // For requests
  body?: RequestBody;        // For requests
  scripts?: Scripts;         // For requests
  docs?: string;             // For requests - documentation/notes
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

export interface OpenCollection {
  path: string;
  collection: Collection;
  expanded: boolean;
  dirty: boolean;
}

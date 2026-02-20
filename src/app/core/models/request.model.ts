import { CollectionItem, HttpMethod, KeyValue, RequestAuth, RequestBody, Scripts } from './collection.model';

export interface ProxyRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  collectionPath?: string;
}

export interface ProxyResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: 'text' | 'base64';
  size: number;
  time: number;
  cookies: Cookie[];
  sentRequest: SentRequest;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
}

export interface SentRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface OpenRequest {
  id: string;
  collectionPath: string;
  itemId: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: RequestAuth;
  scripts: Scripts;
  docs: string;
  dirty: boolean;
  response?: ProxyResponse;
  loading: boolean;
  // Persisted polling config
  pollingEnabled: boolean;
  pollingInterval: number;
  pollingMaxIterations: number;
  // Transient runtime state
  polling: boolean;
  pollingIteration: number;
}

export function createOpenRequest(collectionPath: string, item: CollectionItem): OpenRequest {
  return {
    id: `${collectionPath}:${item.id}`,
    collectionPath,
    itemId: item.id,
    name: item.name,
    method: item.method || 'GET',
    url: item.url || '',
    params: item.params ? [...item.params] : [],
    headers: item.headers ? [...item.headers] : [],
    body: item.body ? { ...item.body, entries: item.body.entries ? [...item.body.entries] : undefined } : { type: 'none' },
    auth: item.auth ? { ...item.auth } : { type: 'none' },
    scripts: item.scripts ? { ...item.scripts } : { pre: '', post: '' },
    docs: item.docs || '',
    dirty: false,
    loading: false,
    pollingEnabled: item.pollingEnabled ?? false,
    pollingInterval: item.pollingInterval ?? 5,
    pollingMaxIterations: item.pollingMaxIterations ?? 0,
    polling: false,
    pollingIteration: 0,
  };
}

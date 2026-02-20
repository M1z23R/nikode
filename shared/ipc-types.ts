import { Collection, Environment } from '../src/app/core/models/collection.model';
import { ProxyRequest, ProxyResponse, Cookie } from '../src/app/core/models/request.model';
import { Secrets } from '../src/app/core/models/environment.model';
import {
  WebSocketConnectRequest,
  WebSocketSendRequest,
  WebSocketDisconnectRequest,
  WebSocketConnectedEvent,
  WebSocketMessageEvent,
  WebSocketCloseEvent,
  WebSocketErrorEvent,
} from '../src/app/core/models/websocket.model';
import { GraphQLRequest, GraphQLResponse } from '../src/app/core/models/graphql.model';

// IPC Channel names as const object for type safety
export const IPC_CHANNELS = {
  // Collection operations
  GET_RECENT: 'get-recent',
  REMOVE_RECENT: 'remove-recent',
  OPEN_COLLECTION: 'open-collection',
  CREATE_COLLECTION: 'create-collection',
  GET_COLLECTION: 'get-collection',
  SAVE_COLLECTION: 'save-collection',
  DELETE_COLLECTION: 'delete-collection',
  COLLECTION_EXISTS: 'collection-exists',
  EXPORT_COLLECTION: 'export-collection',
  IMPORT_COLLECTION: 'import-collection',

  // File watching
  WATCH_COLLECTION: 'watch-collection',
  UNWATCH_COLLECTION: 'unwatch-collection',
  COLLECTION_CHANGED: 'collection-changed',

  // HTTP proxy
  EXECUTE_REQUEST: 'execute-request',

  // GraphQL
  EXECUTE_GRAPHQL: 'execute-graphql',

  // Secrets
  GET_SECRETS: 'get-secrets',
  SAVE_SECRETS: 'save-secrets',

  // Cookie Jar
  GET_COOKIES: 'get-cookies',
  SAVE_COOKIES: 'save-cookies',
  CLEAR_COOKIES: 'clear-cookies',

  // Native dialogs
  SHOW_OPEN_DIALOG: 'show-open-dialog',
  SHOW_SAVE_DIALOG: 'show-save-dialog',

  // File operations
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',

  // OpenAPI import/export
  IMPORT_OPENAPI: 'import-openapi',
  EXPORT_OPENAPI: 'export-openapi',

  // Postman import
  IMPORT_POSTMAN: 'import-postman',
  IMPORT_POSTMAN_ENV: 'import-postman-env',

  // File format detection
  DETECT_FILE_FORMAT: 'detect-file-format',

  // Auth
  AUTH_GET_TOKENS: 'auth-get-tokens',
  AUTH_SAVE_TOKENS: 'auth-save-tokens',
  AUTH_CLEAR_TOKENS: 'auth-clear-tokens',
  AUTH_CALLBACK: 'auth-callback',
  AUTH_ERROR: 'auth-error',

  // WebSocket
  WS_CONNECT: 'ws-connect',
  WS_DISCONNECT: 'ws-disconnect',
  WS_SEND: 'ws-send',
  WS_CONNECTED: 'ws-connected',
  WS_MESSAGE: 'ws-message',
  WS_CLOSE: 'ws-close',
  WS_ERROR: 'ws-error',
} as const;

// Union type of all valid channel names
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Channels that can be invoked (renderer -> main)
export type IpcInvokeChannel = Exclude<IpcChannel, typeof IPC_CHANNELS.COLLECTION_CHANGED>;

// Channels that can be received (main -> renderer)
export type IpcReceiveChannel =
  | typeof IPC_CHANNELS.COLLECTION_CHANGED
  | typeof IPC_CHANNELS.AUTH_CALLBACK
  | typeof IPC_CHANNELS.AUTH_ERROR
  | typeof IPC_CHANNELS.WS_CONNECTED
  | typeof IPC_CHANNELS.WS_MESSAGE
  | typeof IPC_CHANNELS.WS_CLOSE
  | typeof IPC_CHANNELS.WS_ERROR;

// Error codes for IPC operations
export type IpcErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'FILE_EXISTS'
  | 'INVALID_PATH'
  | 'INVALID_JSON'
  | 'INVALID_OPENAPI'
  | 'INVALID_POSTMAN'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_CHANNEL'
  | 'UNKNOWN_ERROR';

// IPC Error interface
export interface IpcError {
  code: IpcErrorCode;
  message: string;
  userMessage: string;
}

// Discriminated union for IPC results
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: IpcError };

// Type guard for IPC errors
export function isIpcError<T>(result: IpcResult<T>): result is { success: false; error: IpcError } {
  return !result.success;
}

// Type guard for IPC success
export function isIpcSuccess<T>(result: IpcResult<T>): result is { success: true; data: T } {
  return result.success;
}

// Request type mapping for each channel
export interface IpcRequestMap {
  [IPC_CHANNELS.GET_RECENT]: void;
  [IPC_CHANNELS.REMOVE_RECENT]: string; // path
  [IPC_CHANNELS.OPEN_COLLECTION]: string; // path
  [IPC_CHANNELS.CREATE_COLLECTION]: { path: string; name: string };
  [IPC_CHANNELS.GET_COLLECTION]: string; // path
  [IPC_CHANNELS.SAVE_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.DELETE_COLLECTION]: string; // path
  [IPC_CHANNELS.COLLECTION_EXISTS]: string; // path
  [IPC_CHANNELS.EXPORT_COLLECTION]: { path: string; format: 'json' | 'yaml' };
  [IPC_CHANNELS.IMPORT_COLLECTION]: { sourcePath: string; targetPath: string };
  [IPC_CHANNELS.WATCH_COLLECTION]: string; // path
  [IPC_CHANNELS.UNWATCH_COLLECTION]: string; // path
  [IPC_CHANNELS.COLLECTION_CHANGED]: void; // Not invokable
  [IPC_CHANNELS.EXECUTE_REQUEST]: ProxyRequest;
  [IPC_CHANNELS.EXECUTE_GRAPHQL]: GraphQLRequest;
  [IPC_CHANNELS.GET_SECRETS]: string; // path
  [IPC_CHANNELS.SAVE_SECRETS]: { path: string; secrets: Secrets };
  [IPC_CHANNELS.GET_COOKIES]: string; // collectionPath
  [IPC_CHANNELS.SAVE_COOKIES]: { path: string; cookies: Cookie[] };
  [IPC_CHANNELS.CLEAR_COOKIES]: string; // collectionPath
  [IPC_CHANNELS.SHOW_OPEN_DIALOG]: OpenDialogOptions | undefined;
  [IPC_CHANNELS.SHOW_SAVE_DIALOG]: SaveDialogOptions | undefined;
  [IPC_CHANNELS.READ_FILE]: string; // path
  [IPC_CHANNELS.WRITE_FILE]: { path: string; content: string };
  [IPC_CHANNELS.IMPORT_OPENAPI]: { sourcePath: string; targetPath: string };
  [IPC_CHANNELS.EXPORT_OPENAPI]: { path: string; format: 'yaml' | 'json' };
  [IPC_CHANNELS.IMPORT_POSTMAN]: { sourcePath: string; targetPath: string };
  [IPC_CHANNELS.IMPORT_POSTMAN_ENV]: { sourcePath: string; collectionPath: string };
  [IPC_CHANNELS.DETECT_FILE_FORMAT]: string; // path
  [IPC_CHANNELS.AUTH_GET_TOKENS]: void;
  [IPC_CHANNELS.AUTH_SAVE_TOKENS]: AuthTokens;
  [IPC_CHANNELS.AUTH_CLEAR_TOKENS]: void;
  [IPC_CHANNELS.AUTH_CALLBACK]: void; // Not invokable
  [IPC_CHANNELS.AUTH_ERROR]: void; // Not invokable
  [IPC_CHANNELS.WS_CONNECT]: WebSocketConnectRequest;
  [IPC_CHANNELS.WS_DISCONNECT]: WebSocketDisconnectRequest;
  [IPC_CHANNELS.WS_SEND]: WebSocketSendRequest;
  [IPC_CHANNELS.WS_CONNECTED]: void; // Not invokable
  [IPC_CHANNELS.WS_MESSAGE]: void; // Not invokable
  [IPC_CHANNELS.WS_CLOSE]: void; // Not invokable
  [IPC_CHANNELS.WS_ERROR]: void; // Not invokable
}

// Response type mapping for each channel
export interface IpcResponseMap {
  [IPC_CHANNELS.GET_RECENT]: { paths: string[] };
  [IPC_CHANNELS.REMOVE_RECENT]: { status: 'ok' };
  [IPC_CHANNELS.OPEN_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.CREATE_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.GET_COLLECTION]: Collection;
  [IPC_CHANNELS.SAVE_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.DELETE_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.COLLECTION_EXISTS]: boolean;
  [IPC_CHANNELS.EXPORT_COLLECTION]: { filePath: string };
  [IPC_CHANNELS.IMPORT_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.WATCH_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.UNWATCH_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.COLLECTION_CHANGED]: { path: string };
  [IPC_CHANNELS.EXECUTE_REQUEST]: ProxyResponse;
  [IPC_CHANNELS.EXECUTE_GRAPHQL]: GraphQLResponse;
  [IPC_CHANNELS.GET_SECRETS]: Secrets;
  [IPC_CHANNELS.SAVE_SECRETS]: { status: 'ok' };
  [IPC_CHANNELS.GET_COOKIES]: Cookie[];
  [IPC_CHANNELS.SAVE_COOKIES]: { status: 'ok' };
  [IPC_CHANNELS.CLEAR_COOKIES]: { status: 'ok' };
  [IPC_CHANNELS.SHOW_OPEN_DIALOG]: { canceled: boolean; filePaths: string[] };
  [IPC_CHANNELS.SHOW_SAVE_DIALOG]: { canceled: boolean; filePath: string | undefined };
  [IPC_CHANNELS.READ_FILE]: string; // file content
  [IPC_CHANNELS.WRITE_FILE]: { status: 'ok' };
  [IPC_CHANNELS.IMPORT_OPENAPI]: { path: string; collection: Collection };
  [IPC_CHANNELS.EXPORT_OPENAPI]: { filePath: string | null };
  [IPC_CHANNELS.IMPORT_POSTMAN]: { path: string; collection: Collection };
  [IPC_CHANNELS.IMPORT_POSTMAN_ENV]: { environment: Environment };
  [IPC_CHANNELS.DETECT_FILE_FORMAT]: FileFormat;
  [IPC_CHANNELS.AUTH_GET_TOKENS]: AuthTokens | null;
  [IPC_CHANNELS.AUTH_SAVE_TOKENS]: { status: 'ok' };
  [IPC_CHANNELS.AUTH_CLEAR_TOKENS]: { status: 'ok' };
  [IPC_CHANNELS.AUTH_CALLBACK]: AuthCallbackData;
  [IPC_CHANNELS.AUTH_ERROR]: AuthErrorData;
  [IPC_CHANNELS.WS_CONNECT]: { success: boolean; error?: string };
  [IPC_CHANNELS.WS_DISCONNECT]: { success: boolean; error?: string };
  [IPC_CHANNELS.WS_SEND]: { success: boolean; error?: string };
  [IPC_CHANNELS.WS_CONNECTED]: WebSocketConnectedEvent;
  [IPC_CHANNELS.WS_MESSAGE]: WebSocketMessageEvent;
  [IPC_CHANNELS.WS_CLOSE]: WebSocketCloseEvent;
  [IPC_CHANNELS.WS_ERROR]: WebSocketErrorEvent;
}

// File format detection result
export type FileFormat = 'nikode' | 'openapi' | 'postman' | 'postman-env' | 'unknown';

// Dialog options
export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
    | 'showHiddenFiles'
    | 'createDirectory'
  >;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
}

// Event callback type for collection changes
export interface CollectionChangedEvent {
  path: string;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

export interface AuthCallbackData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | null;
}

export interface AuthErrorData {
  message: string;
}

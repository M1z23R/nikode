import { Collection } from '../src/app/core/models/collection.model';
import { ProxyRequest, ProxyResponse } from '../src/app/core/models/request.model';
import { Secrets } from '../src/app/core/models/environment.model';

// IPC Channel names as const object for type safety
export const IPC_CHANNELS = {
  // Collection operations
  GET_RECENT: 'get-recent',
  REMOVE_RECENT: 'remove-recent',
  OPEN_COLLECTION: 'open-collection',
  CREATE_COLLECTION: 'create-collection',
  GET_COLLECTION: 'get-collection',
  SAVE_COLLECTION: 'save-collection',
  COLLECTION_EXISTS: 'collection-exists',
  EXPORT_COLLECTION: 'export-collection',
  IMPORT_COLLECTION: 'import-collection',

  // File watching
  WATCH_COLLECTION: 'watch-collection',
  UNWATCH_COLLECTION: 'unwatch-collection',
  COLLECTION_CHANGED: 'collection-changed',

  // HTTP proxy
  EXECUTE_REQUEST: 'execute-request',

  // Secrets
  GET_SECRETS: 'get-secrets',
  SAVE_SECRETS: 'save-secrets',

  // Native dialogs
  SHOW_OPEN_DIALOG: 'show-open-dialog',
  SHOW_SAVE_DIALOG: 'show-save-dialog',

  // File operations
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',

  // OpenAPI import/export
  IMPORT_OPENAPI: 'import-openapi',
  EXPORT_OPENAPI: 'export-openapi',

  // File format detection
  DETECT_FILE_FORMAT: 'detect-file-format',
} as const;

// Union type of all valid channel names
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// Channels that can be invoked (renderer -> main)
export type IpcInvokeChannel = Exclude<IpcChannel, typeof IPC_CHANNELS.COLLECTION_CHANGED>;

// Channels that can be received (main -> renderer)
export type IpcReceiveChannel = typeof IPC_CHANNELS.COLLECTION_CHANGED;

// Error codes for IPC operations
export type IpcErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'FILE_EXISTS'
  | 'INVALID_PATH'
  | 'INVALID_JSON'
  | 'INVALID_OPENAPI'
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
  [IPC_CHANNELS.COLLECTION_EXISTS]: string; // path
  [IPC_CHANNELS.EXPORT_COLLECTION]: { path: string; format: 'json' | 'yaml' };
  [IPC_CHANNELS.IMPORT_COLLECTION]: { sourcePath: string; targetPath: string };
  [IPC_CHANNELS.WATCH_COLLECTION]: string; // path
  [IPC_CHANNELS.UNWATCH_COLLECTION]: string; // path
  [IPC_CHANNELS.COLLECTION_CHANGED]: void; // Not invokable
  [IPC_CHANNELS.EXECUTE_REQUEST]: ProxyRequest;
  [IPC_CHANNELS.GET_SECRETS]: string; // path
  [IPC_CHANNELS.SAVE_SECRETS]: { path: string; secrets: Secrets };
  [IPC_CHANNELS.SHOW_OPEN_DIALOG]: OpenDialogOptions | undefined;
  [IPC_CHANNELS.SHOW_SAVE_DIALOG]: SaveDialogOptions | undefined;
  [IPC_CHANNELS.READ_FILE]: string; // path
  [IPC_CHANNELS.WRITE_FILE]: { path: string; content: string };
  [IPC_CHANNELS.IMPORT_OPENAPI]: { sourcePath: string; targetPath: string };
  [IPC_CHANNELS.EXPORT_OPENAPI]: { path: string; format: 'yaml' | 'json' };
  [IPC_CHANNELS.DETECT_FILE_FORMAT]: string; // path
}

// Response type mapping for each channel
export interface IpcResponseMap {
  [IPC_CHANNELS.GET_RECENT]: { paths: string[] };
  [IPC_CHANNELS.REMOVE_RECENT]: { status: 'ok' };
  [IPC_CHANNELS.OPEN_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.CREATE_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.GET_COLLECTION]: Collection;
  [IPC_CHANNELS.SAVE_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.COLLECTION_EXISTS]: boolean;
  [IPC_CHANNELS.EXPORT_COLLECTION]: { filePath: string };
  [IPC_CHANNELS.IMPORT_COLLECTION]: { path: string; collection: Collection };
  [IPC_CHANNELS.WATCH_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.UNWATCH_COLLECTION]: { status: 'ok' };
  [IPC_CHANNELS.COLLECTION_CHANGED]: { path: string };
  [IPC_CHANNELS.EXECUTE_REQUEST]: ProxyResponse;
  [IPC_CHANNELS.GET_SECRETS]: Secrets;
  [IPC_CHANNELS.SAVE_SECRETS]: { status: 'ok' };
  [IPC_CHANNELS.SHOW_OPEN_DIALOG]: { canceled: boolean; filePaths: string[] };
  [IPC_CHANNELS.SHOW_SAVE_DIALOG]: { canceled: boolean; filePath: string | undefined };
  [IPC_CHANNELS.READ_FILE]: string; // file content
  [IPC_CHANNELS.WRITE_FILE]: { status: 'ok' };
  [IPC_CHANNELS.IMPORT_OPENAPI]: { path: string; collection: Collection };
  [IPC_CHANNELS.EXPORT_OPENAPI]: { filePath: string | null };
  [IPC_CHANNELS.DETECT_FILE_FORMAT]: FileFormat;
}

// File format detection result
export type FileFormat = 'nikode' | 'openapi' | 'unknown';

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

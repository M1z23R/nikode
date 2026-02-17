import { Injectable, inject } from '@angular/core';
import {
  IPC_CHANNELS,
  IpcResult,
  IpcResponseMap,
  OpenDialogOptions,
  SaveDialogOptions,
  CollectionChangedEvent,
  FileFormat,
  isIpcError,
} from '@shared/ipc-types';
import {
  WebSocketConnectRequest,
  WebSocketDisconnectRequest,
  WebSocketSendRequest,
  WebSocketConnectedEvent,
  WebSocketMessageEvent,
  WebSocketCloseEvent,
  WebSocketErrorEvent,
} from '../models/websocket.model';
import { Collection } from '../models/collection.model';
import { ProxyRequest, ProxyResponse } from '../models/request.model';
import { Secrets } from '../models/environment.model';
import { ToastService } from '@m1z23r/ngx-ui';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private toastService = inject(ToastService);

  // Recent collections
  async getRecent(): Promise<IpcResult<{ paths: string[] }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.GET_RECENT);
  }

  async removeRecent(path: string): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.REMOVE_RECENT, path);
  }

  // Collections
  async openCollection(path: string): Promise<IpcResult<{ path: string; collection: Collection }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.OPEN_COLLECTION, path);
  }

  async createCollection(path: string, name: string): Promise<IpcResult<{ path: string; collection: Collection }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.CREATE_COLLECTION, { path, name });
  }

  async getCollection(path: string): Promise<IpcResult<Collection>> {
    return window.electronAPI.invoke(IPC_CHANNELS.GET_COLLECTION, path);
  }

  async saveCollection(path: string, collection: Collection): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.SAVE_COLLECTION, { path, collection });
  }

  async collectionExists(path: string): Promise<IpcResult<boolean>> {
    return window.electronAPI.invoke(IPC_CHANNELS.COLLECTION_EXISTS, path);
  }

  async deleteCollection(path: string): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.DELETE_COLLECTION, path);
  }

  async exportCollection(path: string, format: 'json' | 'yaml'): Promise<IpcResult<{ filePath: string }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.EXPORT_COLLECTION, { path, format });
  }

  async importCollection(sourcePath: string, targetPath: string): Promise<IpcResult<{ path: string; collection: Collection }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.IMPORT_COLLECTION, { sourcePath, targetPath });
  }

  async importOpenApi(sourcePath: string, targetPath: string): Promise<IpcResult<{ path: string; collection: Collection }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.IMPORT_OPENAPI, { sourcePath, targetPath });
  }

  async exportOpenApi(path: string, format: 'yaml' | 'json' = 'yaml'): Promise<IpcResult<{ filePath: string | null }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.EXPORT_OPENAPI, { path, format });
  }

  async detectFileFormat(path: string): Promise<IpcResult<FileFormat>> {
    return window.electronAPI.invoke(IPC_CHANNELS.DETECT_FILE_FORMAT, path);
  }

  // File watching
  async watchCollection(path: string): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.WATCH_COLLECTION, path);
  }

  async unwatchCollection(path: string): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.UNWATCH_COLLECTION, path);
  }

  onCollectionChanged(callback: (event: CollectionChangedEvent) => void): void {
    window.electronAPI.on(IPC_CHANNELS.COLLECTION_CHANGED, callback);
  }

  removeCollectionChangedListener(callback: (event: CollectionChangedEvent) => void): void {
    window.electronAPI.removeListener(IPC_CHANNELS.COLLECTION_CHANGED, callback);
  }

  // Proxy
  async executeRequest(request: ProxyRequest): Promise<IpcResult<ProxyResponse>> {
    return window.electronAPI.invoke(IPC_CHANNELS.EXECUTE_REQUEST, request);
  }

  // Secrets
  async getSecrets(path: string): Promise<IpcResult<Secrets>> {
    return window.electronAPI.invoke(IPC_CHANNELS.GET_SECRETS, path);
  }

  async saveSecrets(path: string, secrets: Secrets): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.SAVE_SECRETS, { path, secrets });
  }

  // Native dialogs
  async showOpenDialog(options?: OpenDialogOptions): Promise<IpcResult<{ canceled: boolean; filePaths: string[] }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options);
  }

  async showSaveDialog(options?: SaveDialogOptions): Promise<IpcResult<{ canceled: boolean; filePath: string | undefined }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.SHOW_SAVE_DIALOG, options);
  }

  // File operations
  async readFile(path: string): Promise<IpcResult<string>> {
    return window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, path);
  }

  async writeFile(path: string, content: string): Promise<IpcResult<{ status: 'ok' }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.WRITE_FILE, { path, content });
  }

  // Convenience method for invoking with automatic error notification
  async invokeWithNotification<T>(
    promise: Promise<IpcResult<T>>,
    options?: { successMessage?: string; silent?: boolean }
  ): Promise<T | undefined> {
    const result = await promise;

    if (isIpcError(result)) {
      if (!options?.silent) {
        this.toastService.error(result.error.userMessage);
      }
      return undefined;
    }

    if (options?.successMessage) {
      this.toastService.success(options.successMessage);
    }

    return result.data;
  }

  // WebSocket operations
  async wsConnect(request: WebSocketConnectRequest): Promise<IpcResult<{ success: boolean; error?: string }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.WS_CONNECT, request);
  }

  async wsDisconnect(request: WebSocketDisconnectRequest): Promise<IpcResult<{ success: boolean; error?: string }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.WS_DISCONNECT, request);
  }

  async wsSend(request: WebSocketSendRequest): Promise<IpcResult<{ success: boolean; error?: string }>> {
    return window.electronAPI.invoke(IPC_CHANNELS.WS_SEND, request);
  }

  onWsConnected(callback: (event: WebSocketConnectedEvent) => void): void {
    window.electronAPI.on(IPC_CHANNELS.WS_CONNECTED, callback);
  }

  onWsMessage(callback: (event: WebSocketMessageEvent) => void): void {
    window.electronAPI.on(IPC_CHANNELS.WS_MESSAGE, callback);
  }

  onWsClose(callback: (event: WebSocketCloseEvent) => void): void {
    window.electronAPI.on(IPC_CHANNELS.WS_CLOSE, callback);
  }

  onWsError(callback: (event: WebSocketErrorEvent) => void): void {
    window.electronAPI.on(IPC_CHANNELS.WS_ERROR, callback);
  }

  removeWsConnectedListener(callback: (event: WebSocketConnectedEvent) => void): void {
    window.electronAPI.removeListener(IPC_CHANNELS.WS_CONNECTED, callback);
  }

  removeWsMessageListener(callback: (event: WebSocketMessageEvent) => void): void {
    window.electronAPI.removeListener(IPC_CHANNELS.WS_MESSAGE, callback);
  }

  removeWsCloseListener(callback: (event: WebSocketCloseEvent) => void): void {
    window.electronAPI.removeListener(IPC_CHANNELS.WS_CLOSE, callback);
  }

  removeWsErrorListener(callback: (event: WebSocketErrorEvent) => void): void {
    window.electronAPI.removeListener(IPC_CHANNELS.WS_ERROR, callback);
  }
}

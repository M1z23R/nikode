import {
  IpcInvokeChannel,
  IpcReceiveChannel,
  IpcRequestMap,
  IpcResponseMap,
  IpcResult,
  OpenDialogOptions,
} from '@shared/ipc-types';

export interface ElectronAPI {
  /**
   * Invoke an IPC channel with typed request/response
   */
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    ...args: IpcRequestMap[C] extends void ? [] : [IpcRequestMap[C]]
  ): Promise<IpcResult<IpcResponseMap[C]>>;

  /**
   * Subscribe to an IPC channel (main -> renderer events)
   */
  on<C extends IpcReceiveChannel>(
    channel: C,
    callback: (data: IpcResponseMap[C]) => void
  ): void;

  /**
   * Remove a listener from an IPC channel
   */
  removeListener<C extends IpcReceiveChannel>(
    channel: C,
    callback: (data: IpcResponseMap[C]) => void
  ): void;

  /**
   * @deprecated Use invoke('show-open-dialog', options) instead
   */
  showOpenDialog(options?: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

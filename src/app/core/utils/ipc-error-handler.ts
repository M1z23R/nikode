import { IpcError, IpcResult, isIpcError } from '@shared/ipc-types';
import { ToastService } from '@m1z23r/ngx-ui';

/**
 * Handles an IPC error by displaying an appropriate notification
 */
export function handleIpcError(
  toastService: ToastService,
  error: IpcError
): void {
  toastService.error(error.userMessage);
}

/**
 * Type guard to check if a result is an IPC error
 */
export { isIpcError };

/**
 * Wraps an async IPC call with automatic error handling
 * Returns the data on success, undefined on error (after showing notification)
 */
export async function withErrorHandling<T>(
  toastService: ToastService,
  promise: Promise<IpcResult<T>>,
  options?: { silent?: boolean }
): Promise<T | undefined> {
  const result = await promise;

  if (isIpcError(result)) {
    if (!options?.silent) {
      handleIpcError(toastService, result.error);
    }
    return undefined;
  }

  return result.data;
}

/**
 * Creates a helper function bound to a toast service
 * Useful for services that need to handle errors frequently
 */
export function createErrorHandler(toastService: ToastService) {
  return {
    handle: (error: IpcError) => handleIpcError(toastService, error),
    wrap: <T>(promise: Promise<IpcResult<T>>, options?: { silent?: boolean }) =>
      withErrorHandling(toastService, promise, options),
  };
}

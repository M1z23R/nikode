import { IpcError, IpcErrorCode, IpcResult } from './ipc-types';

// User-friendly error messages for each error code
export const IPC_ERROR_MESSAGES: Record<IpcErrorCode, string> = {
  FILE_NOT_FOUND: 'The file or folder could not be found. It may have been moved or deleted.',
  PERMISSION_DENIED: 'Permission denied. Please check that you have access to this file or folder.',
  FILE_EXISTS: 'A file with this name already exists at the specified location.',
  INVALID_PATH: 'The specified path is invalid.',
  INVALID_JSON: 'The file contains invalid JSON and could not be parsed.',
  INVALID_OPENAPI: 'The file is not a valid OpenAPI/Swagger specification.',
  INVALID_POSTMAN: 'The file is not a valid Postman collection or environment.',
  NETWORK_ERROR: 'A network error occurred. Please check your connection and try again.',
  TIMEOUT: 'The operation timed out. Please try again.',
  INVALID_CHANNEL: 'An internal error occurred. Invalid IPC channel.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Creates an IpcError object with consistent structure
 */
export function createIpcError(
  code: IpcErrorCode,
  message: string,
  userMessage?: string
): IpcError {
  return {
    code,
    message,
    userMessage: userMessage ?? IPC_ERROR_MESSAGES[code],
  };
}

/**
 * Creates a success IpcResult
 */
export function createSuccessResult<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

/**
 * Creates an error IpcResult
 */
export function createErrorResult<T>(error: IpcError): IpcResult<T> {
  return { success: false, error };
}

/**
 * Maps common Node.js error codes to IpcErrorCodes
 */
export function mapNodeErrorCode(code: string | undefined): IpcErrorCode {
  switch (code) {
    case 'ENOENT':
      return 'FILE_NOT_FOUND';
    case 'EACCES':
    case 'EPERM':
      return 'PERMISSION_DENIED';
    case 'EEXIST':
      return 'FILE_EXISTS';
    case 'EINVAL':
    case 'ENOTDIR':
    case 'EISDIR':
      return 'INVALID_PATH';
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return 'TIMEOUT';
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ENETUNREACH':
      return 'NETWORK_ERROR';
    default:
      return 'UNKNOWN_ERROR';
  }
}

/**
 * Extracts error code from various error types
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

/**
 * Extracts error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

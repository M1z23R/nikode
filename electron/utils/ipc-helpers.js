/**
 * IPC Helper utilities for consistent error handling in the main process
 */

// User-friendly error messages for each error code
const IPC_ERROR_MESSAGES = {
  FILE_NOT_FOUND: 'The file or folder could not be found. It may have been moved or deleted.',
  PERMISSION_DENIED: 'Permission denied. Please check that you have access to this file or folder.',
  FILE_EXISTS: 'A file with this name already exists at the specified location.',
  INVALID_PATH: 'The specified path is invalid.',
  INVALID_JSON: 'The file contains invalid JSON and could not be parsed.',
  NETWORK_ERROR: 'A network error occurred. Please check your connection and try again.',
  TIMEOUT: 'The operation timed out. Please try again.',
  INVALID_CHANNEL: 'An internal error occurred. Invalid IPC channel.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Creates a success IpcResult
 * @param {any} data - The data to wrap
 * @returns {{ success: true, data: any }}
 */
function createSuccessResult(data) {
  return { success: true, data };
}

/**
 * Creates an error IpcResult
 * @param {string} code - The error code
 * @param {string} message - Technical error message
 * @param {string} [userMessage] - User-friendly message (defaults to IPC_ERROR_MESSAGES[code])
 * @returns {{ success: false, error: { code: string, message: string, userMessage: string } }}
 */
function createErrorResult(code, message, userMessage) {
  return {
    success: false,
    error: {
      code,
      message,
      userMessage: userMessage || IPC_ERROR_MESSAGES[code] || IPC_ERROR_MESSAGES.UNKNOWN_ERROR,
    },
  };
}

/**
 * Maps Node.js error codes to IPC error codes
 * @param {string|undefined} code - Node.js error code
 * @returns {string} IPC error code
 */
function mapNodeErrorCode(code) {
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
 * Maps an error to an IpcError object
 * @param {Error} error - The error to map
 * @returns {{ code: string, message: string, userMessage: string }}
 */
function mapErrorToIpcError(error) {
  const nodeCode = error.code;
  const ipcCode = mapNodeErrorCode(nodeCode);

  // Special handling for JSON parse errors
  if (error instanceof SyntaxError || error.message?.includes('JSON')) {
    return {
      code: 'INVALID_JSON',
      message: error.message,
      userMessage: IPC_ERROR_MESSAGES.INVALID_JSON,
    };
  }

  return {
    code: ipcCode,
    message: error.message || 'Unknown error',
    userMessage: IPC_ERROR_MESSAGES[ipcCode] || IPC_ERROR_MESSAGES.UNKNOWN_ERROR,
  };
}

/**
 * Higher-order function that wraps an IPC handler with error handling
 * Catches errors and maps them to IpcResult format
 * @param {Function} handler - The async handler function
 * @returns {Function} Wrapped handler that returns IpcResult
 */
function wrapHandler(handler) {
  return async (...args) => {
    try {
      const result = await handler(...args);
      return createSuccessResult(result);
    } catch (error) {
      console.error('IPC handler error:', error);
      const ipcError = mapErrorToIpcError(error);
      return createErrorResult(ipcError.code, ipcError.message, ipcError.userMessage);
    }
  };
}

module.exports = {
  createSuccessResult,
  createErrorResult,
  mapNodeErrorCode,
  mapErrorToIpcError,
  wrapHandler,
  IPC_ERROR_MESSAGES,
};

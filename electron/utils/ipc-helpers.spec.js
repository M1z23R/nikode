import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSuccessResult,
  createErrorResult,
  mapNodeErrorCode,
  mapErrorToIpcError,
  wrapHandler,
  IPC_ERROR_MESSAGES,
} from './ipc-helpers.js';

describe('ipc-helpers', () => {
  describe('createSuccessResult', () => {
    it('should create a success result with data', () => {
      const result = createSuccessResult({ id: 1, name: 'test' });
      expect(result).toEqual({
        success: true,
        data: { id: 1, name: 'test' },
      });
    });

    it('should handle null data', () => {
      const result = createSuccessResult(null);
      expect(result).toEqual({
        success: true,
        data: null,
      });
    });

    it('should handle undefined data', () => {
      const result = createSuccessResult(undefined);
      expect(result).toEqual({
        success: true,
        data: undefined,
      });
    });

    it('should handle array data', () => {
      const result = createSuccessResult([1, 2, 3]);
      expect(result).toEqual({
        success: true,
        data: [1, 2, 3],
      });
    });

    it('should handle primitive data', () => {
      expect(createSuccessResult(42)).toEqual({ success: true, data: 42 });
      expect(createSuccessResult('hello')).toEqual({ success: true, data: 'hello' });
      expect(createSuccessResult(true)).toEqual({ success: true, data: true });
    });
  });

  describe('createErrorResult', () => {
    it('should create an error result with code and message', () => {
      const result = createErrorResult('FILE_NOT_FOUND', 'File not found: test.txt');
      expect(result).toEqual({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found: test.txt',
          userMessage: IPC_ERROR_MESSAGES.FILE_NOT_FOUND,
        },
      });
    });

    it('should use provided userMessage when given', () => {
      const result = createErrorResult('CUSTOM', 'tech error', 'Custom user message');
      expect(result.error.userMessage).toBe('Custom user message');
    });

    it('should use UNKNOWN_ERROR message for unknown codes', () => {
      const result = createErrorResult('SOME_UNKNOWN_CODE', 'error');
      expect(result.error.userMessage).toBe(IPC_ERROR_MESSAGES.UNKNOWN_ERROR);
    });

    it('should include all known error codes with proper messages', () => {
      const codes = [
        'FILE_NOT_FOUND',
        'PERMISSION_DENIED',
        'FILE_EXISTS',
        'INVALID_PATH',
        'INVALID_JSON',
        'NETWORK_ERROR',
        'TIMEOUT',
      ];

      codes.forEach((code) => {
        const result = createErrorResult(code, 'test');
        expect(result.error.userMessage).toBe(IPC_ERROR_MESSAGES[code]);
      });
    });
  });

  describe('mapNodeErrorCode', () => {
    it('should map ENOENT to FILE_NOT_FOUND', () => {
      expect(mapNodeErrorCode('ENOENT')).toBe('FILE_NOT_FOUND');
    });

    it('should map EACCES to PERMISSION_DENIED', () => {
      expect(mapNodeErrorCode('EACCES')).toBe('PERMISSION_DENIED');
    });

    it('should map EPERM to PERMISSION_DENIED', () => {
      expect(mapNodeErrorCode('EPERM')).toBe('PERMISSION_DENIED');
    });

    it('should map EEXIST to FILE_EXISTS', () => {
      expect(mapNodeErrorCode('EEXIST')).toBe('FILE_EXISTS');
    });

    it('should map EINVAL to INVALID_PATH', () => {
      expect(mapNodeErrorCode('EINVAL')).toBe('INVALID_PATH');
    });

    it('should map ENOTDIR to INVALID_PATH', () => {
      expect(mapNodeErrorCode('ENOTDIR')).toBe('INVALID_PATH');
    });

    it('should map EISDIR to INVALID_PATH', () => {
      expect(mapNodeErrorCode('EISDIR')).toBe('INVALID_PATH');
    });

    it('should map ETIMEDOUT to TIMEOUT', () => {
      expect(mapNodeErrorCode('ETIMEDOUT')).toBe('TIMEOUT');
    });

    it('should map ESOCKETTIMEDOUT to TIMEOUT', () => {
      expect(mapNodeErrorCode('ESOCKETTIMEDOUT')).toBe('TIMEOUT');
    });

    it('should map ECONNREFUSED to NETWORK_ERROR', () => {
      expect(mapNodeErrorCode('ECONNREFUSED')).toBe('NETWORK_ERROR');
    });

    it('should map ENOTFOUND to NETWORK_ERROR', () => {
      expect(mapNodeErrorCode('ENOTFOUND')).toBe('NETWORK_ERROR');
    });

    it('should map ENETUNREACH to NETWORK_ERROR', () => {
      expect(mapNodeErrorCode('ENETUNREACH')).toBe('NETWORK_ERROR');
    });

    it('should map unknown codes to UNKNOWN_ERROR', () => {
      expect(mapNodeErrorCode('UNKNOWN')).toBe('UNKNOWN_ERROR');
      expect(mapNodeErrorCode(undefined)).toBe('UNKNOWN_ERROR');
      expect(mapNodeErrorCode('')).toBe('UNKNOWN_ERROR');
    });
  });

  describe('mapErrorToIpcError', () => {
    it('should map a Node.js error with code', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';

      const result = mapErrorToIpcError(error);
      expect(result).toEqual({
        code: 'FILE_NOT_FOUND',
        message: 'File not found',
        userMessage: IPC_ERROR_MESSAGES.FILE_NOT_FOUND,
      });
    });

    it('should handle SyntaxError as INVALID_JSON', () => {
      const error = new SyntaxError('Unexpected token');

      const result = mapErrorToIpcError(error);
      expect(result).toEqual({
        code: 'INVALID_JSON',
        message: 'Unexpected token',
        userMessage: IPC_ERROR_MESSAGES.INVALID_JSON,
      });
    });

    it('should detect JSON-related errors by message', () => {
      const error = new Error('Invalid JSON at position 5');

      const result = mapErrorToIpcError(error);
      expect(result.code).toBe('INVALID_JSON');
    });

    it('should handle error without code', () => {
      const error = new Error('Something went wrong');

      const result = mapErrorToIpcError(error);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('should handle error without message', () => {
      const error = new Error();
      error.code = 'ENOENT';

      const result = mapErrorToIpcError(error);
      // Function defaults to 'Unknown error' when message is empty
      expect(result.message).toBe('Unknown error');
    });
  });

  describe('wrapHandler', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should wrap a successful handler and return success result', async () => {
      const handler = async (arg) => ({ id: arg });
      const wrapped = wrapHandler(handler);

      const result = await wrapped(123);
      expect(result).toEqual({
        success: true,
        data: { id: 123 },
      });
    });

    it('should pass multiple arguments to the handler', async () => {
      const handler = async (a, b, c) => a + b + c;
      const wrapped = wrapHandler(handler);

      const result = await wrapped(1, 2, 3);
      expect(result).toEqual({
        success: true,
        data: 6,
      });
    });

    it('should catch errors and return error result', async () => {
      const error = new Error('Handler failed');
      error.code = 'ENOENT';
      const handler = async () => {
        throw error;
      };
      const wrapped = wrapHandler(handler);

      const result = await wrapped();
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('FILE_NOT_FOUND');
      expect(result.error.message).toBe('Handler failed');
    });

    it('should log errors to console', async () => {
      const error = new Error('Test error');
      const handler = async () => {
        throw error;
      };
      const wrapped = wrapHandler(handler);

      await wrapped();
      expect(console.error).toHaveBeenCalledWith('IPC handler error:', error);
    });

    it('should handle synchronous errors in async handler', async () => {
      const handler = async () => {
        throw new Error('Sync error in async');
      };
      const wrapped = wrapHandler(handler);

      const result = await wrapped();
      expect(result.success).toBe(false);
    });
  });
});

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

// Allowlist of valid IPC channels for invoke (renderer -> main)
const ALLOWED_CHANNELS = [
  'get-recent',
  'remove-recent',
  'open-collection',
  'create-collection',
  'get-collection',
  'save-collection',
  'delete-collection',
  'collection-exists',
  'export-collection',
  'import-collection',
  'watch-collection',
  'unwatch-collection',
  'execute-request',
  'execute-graphql',
  'get-secrets',
  'save-secrets',
  'show-open-dialog',
  'show-save-dialog',
  'read-file',
  'write-file',
  'import-openapi',
  'export-openapi',
  'detect-file-format',
  'auth-get-tokens',
  'auth-save-tokens',
  'auth-clear-tokens',
  'ws-connect',
  'ws-disconnect',
  'ws-send',
];

// Allowlist of valid channels for receiving events (main -> renderer)
const ALLOWED_RECEIVE_CHANNELS = [
  'collection-changed',
  'auth-callback',
  'auth-error',
  'ws-connected',
  'ws-message',
  'ws-close',
  'ws-error',
];

// Store active listeners for cleanup
const listeners = new Map();

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Invoke an IPC channel with arguments
   * Returns IpcResult<T> for all channels
   */
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      console.error('Invalid IPC channel:', channel);
      return Promise.resolve({
        success: false,
        error: {
          code: 'INVALID_CHANNEL',
          message: `Channel "${channel}" is not in the allowlist`,
          userMessage: 'An internal error occurred. Invalid IPC channel.',
        },
      });
    }

    console.log('IPC invoke:', channel, args);
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Subscribe to an IPC channel (main -> renderer events)
   */
  on: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      console.error('Invalid receive channel:', channel);
      return;
    }

    // Create wrapper to handle the event
    const wrapper = (_event, ...args) => callback(...args);

    // Store the wrapper for later removal
    if (!listeners.has(channel)) {
      listeners.set(channel, new Map());
    }
    listeners.get(channel).set(callback, wrapper);

    ipcRenderer.on(channel, wrapper);
    console.log('IPC listener added:', channel);
  },

  /**
   * Remove a listener from an IPC channel
   */
  removeListener: (channel, callback) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      console.error('Invalid receive channel:', channel);
      return;
    }

    const channelListeners = listeners.get(channel);
    if (channelListeners) {
      const wrapper = channelListeners.get(callback);
      if (wrapper) {
        ipcRenderer.removeListener(channel, wrapper);
        channelListeners.delete(callback);
        console.log('IPC listener removed:', channel);
      }
    }
  },

  /**
   * Legacy method for showing open dialog
   * @deprecated Use invoke('show-open-dialog', options) instead
   */
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
});

console.log('electronAPI exposed to window');

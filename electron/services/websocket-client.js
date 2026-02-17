const WebSocket = require('ws');

/**
 * WebSocket client service for managing WebSocket connections
 */
class WebSocketClient {
  constructor() {
    // Map of connectionId -> { ws: WebSocket, config: object }
    this.connections = new Map();
    // The main window reference (set via setWindow)
    this.mainWindow = null;
  }

  /**
   * Sets the main window reference for sending events
   * @param {BrowserWindow} window
   */
  setWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Connect to a WebSocket server
   * @param {string} connectionId - Unique identifier for the connection
   * @param {string} url - WebSocket URL (ws:// or wss://)
   * @param {Record<string, string>} headers - Optional headers
   * @param {string[]} protocols - Optional subprotocols
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async connect(connectionId, url, headers = {}, protocols = []) {
    // Close existing connection if any
    if (this.connections.has(connectionId)) {
      await this.disconnect(connectionId);
    }

    return new Promise((resolve) => {
      try {
        const wsOptions = {
          headers,
          handshakeTimeout: 10000,
        };

        const ws = protocols.length > 0
          ? new WebSocket(url, protocols, wsOptions)
          : new WebSocket(url, wsOptions);

        const config = { url, headers, protocols };
        this.connections.set(connectionId, { ws, config });

        ws.on('open', () => {
          console.log(`[WebSocket] Connected: ${connectionId}`);
          this.sendToRenderer('ws-connected', {
            connectionId,
            protocol: ws.protocol || undefined,
          });
          resolve({ success: true });
        });

        ws.on('message', (data, isBinary) => {
          const messageType = isBinary ? 'binary' : 'text';
          const messageData = isBinary
            ? data.toString('base64')
            : data.toString('utf8');
          const size = data.length;

          this.sendToRenderer('ws-message', {
            connectionId,
            type: messageType,
            data: messageData,
            size,
          });
        });

        ws.on('close', (code, reason) => {
          console.log(`[WebSocket] Closed: ${connectionId}, code: ${code}`);
          this.connections.delete(connectionId);
          this.sendToRenderer('ws-close', {
            connectionId,
            code,
            reason: reason.toString('utf8'),
            wasClean: code === 1000,
          });
        });

        ws.on('error', (error) => {
          console.error(`[WebSocket] Error: ${connectionId}`, error.message);
          this.sendToRenderer('ws-error', {
            connectionId,
            message: error.message,
          });
          // If not yet connected, reject the connect promise
          if (ws.readyState === WebSocket.CONNECTING) {
            this.connections.delete(connectionId);
            resolve({ success: false, error: error.message });
          }
        });

        // Timeout for connection
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.terminate();
            this.connections.delete(connectionId);
            resolve({ success: false, error: 'Connection timeout' });
          }
        }, 10000);

      } catch (error) {
        console.error(`[WebSocket] Failed to connect: ${connectionId}`, error);
        resolve({ success: false, error: error.message });
      }
    });
  }

  /**
   * Disconnect from a WebSocket server
   * @param {string} connectionId - Connection to disconnect
   * @param {number} code - Close code (default 1000)
   * @param {string} reason - Close reason
   * @returns {{ success: boolean }}
   */
  disconnect(connectionId, code = 1000, reason = '') {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      connection.ws.close(code, reason);
      return { success: true };
    } catch (error) {
      console.error(`[WebSocket] Failed to disconnect: ${connectionId}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a message through a WebSocket connection
   * @param {string} connectionId - Connection to send through
   * @param {string} type - 'text' or 'binary'
   * @param {string} data - Message data (base64 for binary)
   * @returns {{ success: boolean, error?: string }}
   */
  send(connectionId, type, data) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    if (connection.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Connection is not open' };
    }

    try {
      if (type === 'binary') {
        const buffer = Buffer.from(data, 'base64');
        connection.ws.send(buffer);
      } else {
        connection.ws.send(data);
      }
      return { success: true };
    } catch (error) {
      console.error(`[WebSocket] Failed to send: ${connectionId}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get connection status
   * @param {string} connectionId
   * @returns {{ connected: boolean, readyState?: number }}
   */
  getStatus(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { connected: false };
    }
    return {
      connected: connection.ws.readyState === WebSocket.OPEN,
      readyState: connection.ws.readyState,
    };
  }

  /**
   * Disconnect all connections
   */
  disconnectAll() {
    for (const connectionId of this.connections.keys()) {
      this.disconnect(connectionId);
    }
  }

  /**
   * Send event to renderer process
   * @param {string} channel
   * @param {object} data
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

module.exports = { WebSocketClient };

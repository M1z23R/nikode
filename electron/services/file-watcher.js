const fs = require('fs');
const path = require('path');

const COLLECTION_FILE_NAME = 'nikode.json';

/**
 * Service for watching collection files for external changes
 */
class FileWatcherService {
  constructor() {
    // Map of collection path -> FSWatcher
    this.watchers = new Map();
    // The main window reference (set via setWindow)
    this.mainWindow = null;
    // Debounce timers to prevent rapid-fire events
    this.debounceTimers = new Map();
    // Debounce delay in ms
    this.debounceDelay = 500;
  }

  /**
   * Sets the main window reference for sending events
   * @param {BrowserWindow} window
   */
  setWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Start watching a collection directory for changes to nikode.json
   * @param {string} collectionPath - The directory containing nikode.json
   * @returns {boolean} True if watching started successfully
   */
  watch(collectionPath) {
    // Don't double-watch
    if (this.watchers.has(collectionPath)) {
      console.log('Already watching:', collectionPath);
      return true;
    }

    const filePath = path.join(collectionPath, COLLECTION_FILE_NAME);

    try {
      const watcher = fs.watch(filePath, (eventType, filename) => {
        if (eventType === 'change') {
          this.handleChange(collectionPath);
        }
      });

      watcher.on('error', (error) => {
        console.error('File watcher error:', error);
        this.unwatch(collectionPath);
      });

      this.watchers.set(collectionPath, watcher);
      console.log('Started watching:', collectionPath);
      return true;
    } catch (error) {
      console.error('Failed to start file watcher:', error);
      return false;
    }
  }

  /**
   * Stop watching a collection directory
   * @param {string} collectionPath - The directory to stop watching
   */
  unwatch(collectionPath) {
    const watcher = this.watchers.get(collectionPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(collectionPath);
      console.log('Stopped watching:', collectionPath);
    }

    // Clear any pending debounce timer
    const timer = this.debounceTimers.get(collectionPath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(collectionPath);
    }
  }

  /**
   * Stop all watchers
   */
  unwatchAll() {
    for (const collectionPath of this.watchers.keys()) {
      this.unwatch(collectionPath);
    }
  }

  /**
   * Handle a file change event (debounced)
   * @param {string} collectionPath
   */
  handleChange(collectionPath) {
    // Clear existing timer if any
    const existingTimer = this.debounceTimers.get(collectionPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(collectionPath);
      this.notifyChange(collectionPath);
    }, this.debounceDelay);

    this.debounceTimers.set(collectionPath, timer);
  }

  /**
   * Send collection-changed event to the renderer
   * @param {string} collectionPath
   */
  notifyChange(collectionPath) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log('Notifying collection change:', collectionPath);
      this.mainWindow.webContents.send('collection-changed', { path: collectionPath });
    }
  }

  /**
   * Check if a collection is being watched
   * @param {string} collectionPath
   * @returns {boolean}
   */
  isWatching(collectionPath) {
    return this.watchers.has(collectionPath);
  }
}

module.exports = { FileWatcherService };

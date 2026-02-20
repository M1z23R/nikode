const fs = require('fs');

/**
 * Service for watching collection files for external changes
 */
class FileWatcherService {
  constructor() {
    // Map of collection file path -> FSWatcher
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
   * Start watching a collection file for changes
   * @param {string} collectionFilePath - Full path to the .nikode.json file
   * @returns {boolean} True if watching started successfully
   */
  watch(collectionFilePath) {
    // Don't double-watch
    if (this.watchers.has(collectionFilePath)) {
      console.log('Already watching:', collectionFilePath);
      return true;
    }

    try {
      const watcher = fs.watch(collectionFilePath, (eventType, filename) => {
        if (eventType === 'change') {
          this.handleChange(collectionFilePath);
        }
      });

      watcher.on('error', (error) => {
        console.error('File watcher error:', error);
        this.unwatch(collectionFilePath);
      });

      this.watchers.set(collectionFilePath, watcher);
      console.log('Started watching:', collectionFilePath);
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

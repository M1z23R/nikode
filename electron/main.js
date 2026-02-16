const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { FileService } = require('./services/file-service');
const { SecretsService } = require('./services/secrets-service');
const { HttpClient } = require('./services/http-client');
const { FileWatcherService } = require('./services/file-watcher');
const { OpenApiConverter } = require('./services/openapi-converter');
const { wrapHandler } = require('./utils/ipc-helpers');

const fileService = new FileService();
const secretsService = new SecretsService();
const httpClient = new HttpClient();
const fileWatcher = new FileWatcherService();
const openApiConverter = new OpenApiConverter();

let mainWindow;

async function createWindow() {
  await secretsService.init();

  // Disable the application menu
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    },
  });

  // Set the main window reference for file watcher events
  fileWatcher.setWindow(mainWindow);

  // In development, load from Angular dev server
  // In production, load from built files
  const isDev = process.env.NODE_ENV === 'development';
  console.log('Running in', isDev ? 'DEVELOPMENT' : 'PRODUCTION', 'mode');

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/frontend/browser/index.html'));
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDev ? 'http://localhost:4200' : 'file://';
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Clean up watchers when window closes
  mainWindow.on('closed', () => {
    fileWatcher.unwatchAll();
    mainWindow = null;
  });
}

// IPC Handlers - All wrapped with error handling

// Recent collections
ipcMain.handle(
  'get-recent',
  wrapHandler(async () => {
    const paths = await secretsService.getRecentPaths();
    return { paths };
  }),
);

ipcMain.handle(
  'remove-recent',
  wrapHandler(async (event, collectionPath) => {
    await secretsService.removeRecentPath(collectionPath);
    return { status: 'ok' };
  }),
);

// Open collection
ipcMain.handle(
  'open-collection',
  wrapHandler(async (event, collectionPath) => {
    const collection = await fileService.readCollection(collectionPath);
    await secretsService.addRecentPath(collectionPath);
    return { path: collectionPath, collection };
  }),
);

// Create collection
ipcMain.handle(
  'create-collection',
  wrapHandler(async (event, args) => {
    const { path: collectionPath, name } = args;
    const collection = await fileService.createCollection(collectionPath, name);
    await secretsService.addRecentPath(collectionPath);
    return { path: collectionPath, collection };
  }),
);

// Get collection
ipcMain.handle(
  'get-collection',
  wrapHandler(async (event, collectionPath) => {
    return await fileService.readCollection(collectionPath);
  }),
);

// Save collection
ipcMain.handle(
  'save-collection',
  wrapHandler(async (event, args) => {
    const { path: collectionPath, collection } = args;
    await fileService.writeCollection(collectionPath, collection);
    return { status: 'ok' };
  }),
);

// Check if collection exists
ipcMain.handle(
  'collection-exists',
  wrapHandler(async (event, collectionPath) => {
    return await fileService.collectionExists(collectionPath);
  }),
);

// Export collection
ipcMain.handle(
  'export-collection',
  wrapHandler(async (event, args) => {
    const { path: collectionPath, format } = args;

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Collection',
      defaultPath: `collection.${format}`,
      filters: [
        format === 'json'
          ? { name: 'JSON Files', extensions: ['json'] }
          : { name: 'YAML Files', extensions: ['yaml', 'yml'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { filePath: null };
    }

    const content = await fileService.exportCollection(collectionPath, format);
    const fs = require('fs/promises');
    await fs.writeFile(result.filePath, content, 'utf-8');

    return { filePath: result.filePath };
  }),
);

// Import collection
ipcMain.handle(
  'import-collection',
  wrapHandler(async (event, args) => {
    const { sourcePath, targetPath } = args;
    const collection = await fileService.importCollection(sourcePath, targetPath);
    await secretsService.addRecentPath(targetPath);
    return { path: targetPath, collection };
  }),
);

// Watch collection for changes
ipcMain.handle(
  'watch-collection',
  wrapHandler(async (event, collectionPath) => {
    const success = fileWatcher.watch(collectionPath);
    if (!success) {
      throw new Error('Failed to start file watcher');
    }
    return { status: 'ok' };
  }),
);

// Stop watching collection
ipcMain.handle(
  'unwatch-collection',
  wrapHandler(async (event, collectionPath) => {
    fileWatcher.unwatch(collectionPath);
    return { status: 'ok' };
  }),
);

// Execute HTTP request (proxy)
ipcMain.handle(
  'execute-request',
  wrapHandler(async (event, request) => {
    return await httpClient.execute(request);
  }),
);

// Get secrets
ipcMain.handle(
  'get-secrets',
  wrapHandler(async (event, collectionPath) => {
    return await secretsService.getSecrets(collectionPath);
  }),
);

// Save secrets
ipcMain.handle(
  'save-secrets',
  wrapHandler(async (event, args) => {
    const { path: collectionPath, secrets } = args;
    await secretsService.saveSecrets(collectionPath, secrets);
    return { status: 'ok' };
  }),
);

// Show open dialog (native file picker)
ipcMain.handle(
  'show-open-dialog',
  wrapHandler(async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      ...options,
    });
    return result;
  }),
);

// Show save dialog (native file save picker)
ipcMain.handle(
  'show-save-dialog',
  wrapHandler(async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      ...options,
    });
    return { canceled: result.canceled, filePath: result.filePath };
  }),
);

// Read file
ipcMain.handle(
  'read-file',
  wrapHandler(async (event, filePath) => {
    const fs = require('fs/promises');
    return await fs.readFile(filePath, 'utf-8');
  }),
);

// Write file
ipcMain.handle(
  'write-file',
  wrapHandler(async (event, args) => {
    const { path: filePath, content } = args;
    const fs = require('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
    return { status: 'ok' };
  }),
);

// Import OpenAPI spec
ipcMain.handle(
  'import-openapi',
  wrapHandler(async (event, args) => {
    const { sourcePath, targetPath } = args;

    // Convert OpenAPI to Nikode collection
    const collection = await openApiConverter.importFromOpenApi(sourcePath);

    // Ensure target directory exists
    const fs = require('fs/promises');
    await fs.mkdir(targetPath, { recursive: true });

    // Write the collection
    await fileService.writeCollection(targetPath, collection);
    await secretsService.addRecentPath(targetPath);

    return { path: targetPath, collection };
  }),
);

// Detect file format
ipcMain.handle(
  'detect-file-format',
  wrapHandler(async (event, filePath) => {
    return await fileService.detectFileFormat(filePath);
  }),
);

// Export to OpenAPI
ipcMain.handle(
  'export-openapi',
  wrapHandler(async (event, args) => {
    const { path: collectionPath, format } = args;

    // Read the collection
    const collection = await fileService.readCollection(collectionPath);

    // Convert to OpenAPI
    const spec = openApiConverter.exportToOpenApi(collection);

    // Determine file extension and content
    const ext = format === 'yaml' ? 'yaml' : 'json';
    let content;
    if (format === 'yaml') {
      content = fileService.toYaml(spec);
    } else {
      content = JSON.stringify(spec, null, 2);
    }

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export as OpenAPI',
      defaultPath: `${collection.name || 'collection'}-openapi.${ext}`,
      filters: [
        format === 'yaml'
          ? { name: 'YAML Files', extensions: ['yaml', 'yml'] }
          : { name: 'JSON Files', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { filePath: null };
    }

    // Write the file
    const fs = require('fs/promises');
    await fs.writeFile(result.filePath, content, 'utf-8');

    return { filePath: result.filePath };
  }),
);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up on app quit
app.on('before-quit', () => {
  fileWatcher.unwatchAll();
});

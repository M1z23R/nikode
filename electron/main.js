const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const { FileService } = require('./services/file-service');
const { SecretsService } = require('./services/secrets-service');
const { AuthService } = require('./services/auth-service');
const { HttpClient } = require('./services/http-client');
const { FileWatcherService } = require('./services/file-watcher');
const { OpenApiConverter } = require('./services/openapi-converter');
const { wrapHandler } = require('./utils/ipc-helpers');

const fileService = new FileService();
const secretsService = new SecretsService();
const authService = new AuthService();
const httpClient = new HttpClient();
const fileWatcher = new FileWatcherService();
const openApiConverter = new OpenApiConverter();

// Request single instance lock for deep link handling on Windows/Linux
const gotTheLock = app.requestSingleInstanceLock();
console.log('[DEBUG] gotTheLock:', gotTheLock);
console.log('[DEBUG] process.argv:', process.argv);

if (!gotTheLock) {
  console.log('[DEBUG] Another instance is running, quitting...');
  app.quit();
}

let mainWindow;

// Get API base URL based on environment
function getApiBaseUrl() {
  const isDev = process.env.NODE_ENV === 'development';
  return isDev ? 'http://localhost:8080/api/v1' : 'https://nikode.dimitrije.dev/api/v1';
}

// Parse nikode:// auth callback URL and extract auth code
function parseAuthCallback(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'nikode:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
      return null;
    }
    const code = parsed.searchParams.get('code');
    if (!code) {
      return null;
    }
    return { code };
  } catch {
    return null;
  }
}

// Exchange auth code for tokens
async function exchangeAuthCode(code) {
  const response = await fetch(`${getApiBaseUrl()}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`Auth exchange failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || null,
  };
}

// Handle deep link URL
async function handleDeepLink(url) {
  console.log('[DEBUG] handleDeepLink called with:', url);
  const parsed = parseAuthCallback(url);
  console.log('[DEBUG] parsed auth callback:', parsed);

  if (!parsed || !mainWindow) {
    return;
  }

  try {
    // Exchange the code for tokens
    console.log('[DEBUG] exchanging auth code for tokens');
    const authData = await exchangeAuthCode(parsed.code);
    console.log('[DEBUG] exchange successful, sending auth-callback to renderer');
    mainWindow.webContents.send('auth-callback', authData);
  } catch (error) {
    console.error('[ERROR] Auth code exchange failed:', error.message);
    mainWindow.webContents.send('auth-error', { message: error.message });
  }

  // Focus the window when auth callback is received
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

async function createWindow() {
  await secretsService.init();
  await authService.init();

  const isDev = process.env.NODE_ENV === 'development';

  // Disable the application menu
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  // Set the main window reference for file watcher events
  fileWatcher.setWindow(mainWindow);

  // In development, load from Angular dev server
  // In production, load from built files
  console.log('Running in', isDev ? 'DEVELOPMENT' : 'PRODUCTION', 'mode');

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
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

// Delete collection
ipcMain.handle(
  'delete-collection',
  wrapHandler(async (event, collectionPath) => {
    await fileService.deleteCollection(collectionPath);
    await secretsService.removeRecentPath(collectionPath);
    return { status: 'ok' };
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

// Auth - Get tokens
ipcMain.handle(
  'auth-get-tokens',
  wrapHandler(async () => {
    return await authService.getTokens();
  }),
);

// Auth - Save tokens
ipcMain.handle(
  'auth-save-tokens',
  wrapHandler(async (event, tokens) => {
    await authService.saveTokens(tokens);
    return { status: 'ok' };
  }),
);

// Auth - Clear tokens
ipcMain.handle(
  'auth-clear-tokens',
  wrapHandler(async () => {
    await authService.clearTokens();
    return { status: 'ok' };
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

// Register nikode:// protocol handler
if (process.defaultApp) {
  // Dev mode: pass the script path
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nikode', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  // Production: just register
  app.setAsDefaultProtocolClient('nikode');
}

// Handle second instance (Windows/Linux deep link)
app.on('second-instance', (event, commandLine) => {
  console.log('[DEBUG] second-instance event fired');
  console.log('[DEBUG] commandLine:', commandLine);
  // Find the deep link URL in command line args
  const url = commandLine.find((arg) => arg.startsWith('nikode://'));
  console.log('[DEBUG] found url:', url);
  if (url) {
    handleDeepLink(url);
  }

  // Focus window if it exists
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

// Handle open-url event (macOS deep link)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

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

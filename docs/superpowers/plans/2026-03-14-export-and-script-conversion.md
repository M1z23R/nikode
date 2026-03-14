# Export Functionality & Script Conversion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable exporting Nikode collections to Postman and Bruno formats with a card-based export dialog.

**Architecture:** Add `exportToPostman()` and `exportToBruno()` methods to existing converter classes. Create new IPC channels for export operations. Rewrite the export dialog as a card-based UI matching the import dialog pattern.

**Tech Stack:** Angular 19, Electron, Node.js, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-14-export-and-script-conversion-design.md`

---

## Chunk 1: Postman Exporter

### Task 1: Add exportToPostman to PostmanConverter

**Files:**
- Modify: `electron/services/postman-converter.js`

- [ ] **Step 1: Add exportToPostman method signature**

Add the export method after `convertScripts()` method (around line 318):

```javascript
/**
 * Export a Nikode Collection to Postman v2.1 format
 * @param {object} collection - Nikode Collection object
 * @returns {object} Postman Collection v2.1 object
 */
exportToPostman(collection) {
  const postmanCollection = {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      version: collection.version || '1.0.0',
    },
    item: this.exportItems(collection.items || []),
    variable: [],
  };

  // Convert first environment to collection variables
  if (collection.environments?.length > 0) {
    const env = collection.environments[0];
    postmanCollection.variable = env.variables
      .filter(v => v.enabled !== false)
      .map(v => ({
        key: v.key,
        value: v.secret ? '' : v.value,
        type: 'string',
      }));
  }

  return postmanCollection;
}
```

- [ ] **Step 2: Add exportItems method**

```javascript
/**
 * Recursively export Nikode items to Postman format
 * @param {Array} items - Nikode CollectionItem array
 * @returns {Array} Postman item array
 */
exportItems(items) {
  return items.map(item => {
    if (item.type === 'folder') {
      return {
        name: item.name,
        item: this.exportItems(item.items || []),
      };
    }

    // Skip WebSocket items (not supported by Postman)
    if (item.type === 'websocket') {
      return null;
    }

    return this.exportRequest(item);
  }).filter(Boolean);
}
```

- [ ] **Step 3: Add exportRequest method**

```javascript
/**
 * Export a single Nikode request to Postman format
 * @param {object} item - Nikode request item
 * @returns {object} Postman request item
 */
exportRequest(item) {
  const result = {
    name: item.name,
    request: {
      method: item.method || 'GET',
      url: this.exportUrl(item.url, item.params),
      header: this.exportHeaders(item.headers),
      body: this.exportBody(item.body, item.type, item.gqlQuery, item.gqlVariables),
    },
  };

  // Add auth if present
  if (item.auth && item.auth.type !== 'none') {
    result.request.auth = this.exportAuth(item.auth);
  }

  // Add description
  if (item.docs) {
    result.request.description = item.docs;
  }

  // Add scripts as events
  if (item.scripts?.pre || item.scripts?.post) {
    result.event = this.exportScriptsToEvents(item.scripts);
  }

  return result;
}
```

- [ ] **Step 4: Add exportUrl method**

```javascript
/**
 * Export URL with query parameters to Postman format
 * @param {string} url - URL string
 * @param {Array} params - Query parameters
 * @returns {object} Postman URL object
 */
exportUrl(url, params) {
  const result = {
    raw: url || '',
  };

  // Add query parameters
  if (params?.length > 0) {
    const enabledParams = params.filter(p => p.key);
    if (enabledParams.length > 0) {
      result.query = enabledParams.map(p => ({
        key: p.key,
        value: p.value || '',
        disabled: p.enabled === false,
      }));

      // Append to raw URL
      const queryString = enabledParams
        .filter(p => p.enabled !== false)
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
        .join('&');
      if (queryString) {
        result.raw += (url?.includes('?') ? '&' : '?') + queryString;
      }
    }
  }

  return result;
}
```

- [ ] **Step 5: Add exportHeaders method**

```javascript
/**
 * Export headers to Postman format
 * @param {Array} headers - Nikode headers array
 * @returns {Array} Postman header array
 */
exportHeaders(headers) {
  if (!headers?.length) return [];

  return headers
    .filter(h => h.key) // Skip empty rows
    .map(h => ({
      key: h.key,
      value: h.value || '',
      disabled: h.enabled === false,
    }));
}
```

- [ ] **Step 6: Add exportBody method**

```javascript
/**
 * Export request body to Postman format
 * @param {object} body - Nikode body object
 * @param {string} itemType - Item type (request, graphql)
 * @param {string} gqlQuery - GraphQL query (for graphql type)
 * @param {string} gqlVariables - GraphQL variables (for graphql type)
 * @returns {object} Postman body object
 */
exportBody(body, itemType, gqlQuery, gqlVariables) {
  // Handle GraphQL items
  if (itemType === 'graphql') {
    return {
      mode: 'graphql',
      graphql: {
        query: gqlQuery || '',
        variables: gqlVariables || '',
      },
    };
  }

  if (!body || body.type === 'none') {
    return undefined;
  }

  switch (body.type) {
    case 'json':
      return {
        mode: 'raw',
        raw: body.content || '',
        options: { raw: { language: 'json' } },
      };

    case 'raw':
      return {
        mode: 'raw',
        raw: body.content || '',
      };

    case 'form-data':
      return {
        mode: 'formdata',
        formdata: (body.entries || []).map(e => ({
          key: e.key,
          value: e.value || '',
          disabled: e.enabled === false,
          type: e.type === 'file' ? 'file' : 'text',
        })),
      };

    case 'x-www-form-urlencoded':
      return {
        mode: 'urlencoded',
        urlencoded: (body.entries || []).map(e => ({
          key: e.key,
          value: e.value || '',
          disabled: e.enabled === false,
        })),
      };

    default:
      return undefined;
  }
}
```

- [ ] **Step 7: Add exportAuth method**

```javascript
/**
 * Export auth config to Postman format
 * @param {object} auth - Nikode auth object
 * @returns {object} Postman auth object
 */
exportAuth(auth) {
  if (!auth || auth.type === 'none') return undefined;

  switch (auth.type) {
    case 'bearer':
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: auth.token || '', type: 'string' }],
      };

    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username || '', type: 'string' },
          { key: 'password', value: auth.password || '', type: 'string' },
        ],
      };

    case 'api-key':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.key || '', type: 'string' },
          { key: 'value', value: auth.value || '', type: 'string' },
          { key: 'in', value: auth.addTo === 'query' ? 'query' : 'header', type: 'string' },
        ],
      };

    default:
      return undefined;
  }
}
```

- [ ] **Step 8: Add exportScriptsToEvents method**

```javascript
/**
 * Export scripts to Postman event format with warning header
 * @param {object} scripts - Nikode scripts { pre, post }
 * @returns {Array} Postman event array
 */
exportScriptsToEvents(scripts) {
  const events = [];
  const WARNING = '// WARNING: This script uses Nikode (nk.*) API\n// Manual conversion to pm.* may be required\n\n';

  if (scripts.pre) {
    events.push({
      listen: 'prerequest',
      script: {
        exec: (WARNING + scripts.pre).split('\n'),
        type: 'text/javascript',
      },
    });
  }

  if (scripts.post) {
    events.push({
      listen: 'test',
      script: {
        exec: (WARNING + scripts.post).split('\n'),
        type: 'text/javascript',
      },
    });
  }

  return events;
}
```

- [ ] **Step 9: Add exportEnvironment method**

```javascript
/**
 * Export a Nikode environment to Postman environment format
 * @param {object} environment - Nikode Environment object
 * @returns {object} Postman environment object
 */
exportEnvironment(environment) {
  return {
    name: environment.name,
    values: environment.variables.map(v => ({
      key: v.key,
      value: v.secret ? '' : v.value,
      enabled: v.enabled !== false,
      type: v.secret ? 'secret' : 'default',
    })),
    _postman_variable_scope: 'environment',
  };
}
```

- [ ] **Step 10: Commit**

```bash
git add electron/services/postman-converter.js
git commit -m "feat: add Postman export to PostmanConverter"
```

---

### Task 2: Add exportToBruno to BrunoConverter

**Files:**
- Modify: `electron/services/bruno-converter.js`

Note: The file already imports `fs` and `path` at module level. The methods below use `require('fs/promises')` inline to get the promises API (the module-level `fs` uses callbacks).

- [ ] **Step 1: Add exportToBruno method**

Add after the `slugify()` method:

```javascript
/**
 * Export a Nikode Collection to Bruno folder structure
 * @param {object} collection - Nikode Collection object
 * @param {string} targetPath - Path to create Bruno folder
 * @returns {Promise<object>} Export result with stats
 */
async exportToBruno(collection, targetPath) {
  const fs = require('fs/promises');
  const stats = { requests: 0, folders: 0, environments: 0, skipped: [] };

  // Create target directory
  await fs.mkdir(targetPath, { recursive: true });

  // Write bruno.json
  const brunoJson = {
    version: '1',
    name: collection.name,
    type: 'collection',
  };
  await fs.writeFile(
    path.join(targetPath, 'bruno.json'),
    JSON.stringify(brunoJson, null, 2)
  );

  // Export items recursively
  await this.exportItemsToFolder(collection.items || [], targetPath, stats);

  // Export environments
  if (collection.environments?.length > 0) {
    const envDir = path.join(targetPath, 'environments');
    await fs.mkdir(envDir, { recursive: true });

    for (const env of collection.environments) {
      const envContent = this.generateEnvironmentBru(env);
      const fileName = this.sanitizeFileName(env.name) + '.bru';
      await fs.writeFile(path.join(envDir, fileName), envContent);
      stats.environments++;
    }
  }

  return stats;
}
```

- [ ] **Step 2: Add exportItemsToFolder method**

```javascript
/**
 * Recursively export items to folder structure
 * @param {Array} items - Nikode items array
 * @param {string} folderPath - Current folder path
 * @param {object} stats - Stats object to update
 * @param {number} seq - Sequence counter
 */
async exportItemsToFolder(items, folderPath, stats, seq = 1) {
  const fs = require('fs/promises');

  for (const item of items) {
    if (item.type === 'folder') {
      const folderName = this.sanitizeFileName(item.name);
      const subFolderPath = path.join(folderPath, folderName);
      await fs.mkdir(subFolderPath, { recursive: true });

      // Write folder.bru for metadata
      const folderBru = `meta {\n  name: ${item.name}\n}\n`;
      await fs.writeFile(path.join(subFolderPath, 'folder.bru'), folderBru);

      stats.folders++;
      await this.exportItemsToFolder(item.items || [], subFolderPath, stats, 1);
    } else if (item.type === 'websocket') {
      stats.skipped.push({ name: item.name, reason: 'WebSocket not supported' });
    } else {
      const bruContent = this.generateRequestBru(item, seq++);
      const fileName = this.sanitizeFileName(item.name) + '.bru';
      await fs.writeFile(path.join(folderPath, fileName), bruContent);
      stats.requests++;
    }
  }
}
```

- [ ] **Step 3: Add generateRequestBru method**

```javascript
/**
 * Generate .bru file content for a request
 * @param {object} item - Nikode request item
 * @param {number} seq - Sequence number
 * @returns {string} .bru file content
 */
generateRequestBru(item, seq) {
  const parts = [];

  // Meta block
  parts.push(`meta {
  name: ${item.name}
  type: ${item.type === 'graphql' ? 'graphql' : 'http'}
  seq: ${seq}
}`);

  // HTTP method block
  const method = (item.method || 'get').toLowerCase();
  parts.push(`\n${method} {
  url: ${item.url || ''}
}`);

  // Query params
  if (item.params?.length > 0) {
    const params = item.params
      .filter(p => p.key)
      .map(p => `  ${p.enabled === false ? '~' : ''}${p.key}: ${p.value || ''}`)
      .join('\n');
    if (params) {
      parts.push(`\nquery {\n${params}\n}`);
    }
  }

  // Headers
  if (item.headers?.length > 0) {
    const headers = item.headers
      .filter(h => h.key)
      .map(h => `  ${h.enabled === false ? '~' : ''}${h.key}: ${h.value || ''}`)
      .join('\n');
    if (headers) {
      parts.push(`\nheaders {\n${headers}\n}`);
    }
  }

  // Auth
  if (item.auth && item.auth.type !== 'none') {
    parts.push('\n' + this.generateAuthBlock(item.auth));
  }

  // Body
  if (item.body && item.body.type !== 'none') {
    parts.push('\n' + this.generateBodyBlock(item.body));
  }

  // GraphQL
  if (item.type === 'graphql' && item.gqlQuery) {
    parts.push(`\nbody:graphql {\n${item.gqlQuery}\n}`);
    if (item.gqlVariables) {
      parts.push(`\nbody:graphql:vars {\n${item.gqlVariables}\n}`);
    }
  }

  // Scripts
  if (item.scripts?.pre) {
    const WARNING = '// WARNING: This script uses Nikode (nk.*) API\n// Manual conversion to bru.* may be required\n\n';
    parts.push(`\nscript:pre-request {\n${WARNING}${item.scripts.pre}\n}`);
  }
  if (item.scripts?.post) {
    const WARNING = '// WARNING: This script uses Nikode (nk.*) API\n// Manual conversion to bru.* may be required\n\n';
    parts.push(`\nscript:post-response {\n${WARNING}${item.scripts.post}\n}`);
  }

  // Docs
  if (item.docs) {
    parts.push(`\ndocs {\n${item.docs}\n}`);
  }

  return parts.join('\n') + '\n';
}
```

- [ ] **Step 4: Add generateAuthBlock method**

```javascript
/**
 * Generate auth block for .bru file
 * @param {object} auth - Nikode auth object
 * @returns {string} Auth block content
 */
generateAuthBlock(auth) {
  switch (auth.type) {
    case 'bearer':
      return `auth:bearer {\n  token: ${auth.token || ''}\n}`;
    case 'basic':
      return `auth:basic {\n  username: ${auth.username || ''}\n  password: ${auth.password || ''}\n}`;
    case 'api-key':
      return `auth:apikey {\n  key: ${auth.key || ''}\n  value: ${auth.value || ''}\n  placement: ${auth.addTo === 'query' ? 'queryparams' : 'header'}\n}`;
    default:
      return '';
  }
}
```

- [ ] **Step 5: Add generateBodyBlock method**

```javascript
/**
 * Generate body block for .bru file
 * @param {object} body - Nikode body object
 * @returns {string} Body block content
 */
generateBodyBlock(body) {
  switch (body.type) {
    case 'json':
      return `body:json {\n${body.content || ''}\n}`;
    case 'raw':
      return `body:text {\n${body.content || ''}\n}`;
    case 'x-www-form-urlencoded':
      const urlencoded = (body.entries || [])
        .filter(e => e.key)
        .map(e => `  ${e.enabled === false ? '~' : ''}${e.key}: ${e.value || ''}`)
        .join('\n');
      return `body:form-urlencoded {\n${urlencoded}\n}`;
    case 'form-data':
      const formdata = (body.entries || [])
        .filter(e => e.key)
        .map(e => `  ${e.enabled === false ? '~' : ''}${e.key}: ${e.value || ''}`)
        .join('\n');
      return `body:multipart-form {\n${formdata}\n}`;
    default:
      return '';
  }
}
```

- [ ] **Step 6: Add generateEnvironmentBru method**

```javascript
/**
 * Generate environment .bru file content
 * @param {object} env - Nikode environment object
 * @returns {string} Environment .bru file content
 */
generateEnvironmentBru(env) {
  const vars = [];
  const secretVars = [];

  for (const v of env.variables || []) {
    if (!v.key) continue;
    const line = `  ${v.enabled === false ? '~' : ''}${v.key}: ${v.secret ? '' : v.value || ''}`;
    if (v.secret) {
      secretVars.push(line + ' // SECRET: re-enter after import');
    } else {
      vars.push(line);
    }
  }

  let content = '';
  if (vars.length > 0) {
    content += `vars {\n${vars.join('\n')}\n}\n`;
  }
  if (secretVars.length > 0) {
    content += `\nvars:secret {\n${secretVars.join('\n')}\n}\n`;
  }

  return content || 'vars {\n}\n';
}
```

- [ ] **Step 7: Add sanitizeFileName method**

```javascript
/**
 * Sanitize a string for use as a filename
 * @param {string} name - Original name
 * @returns {string} Sanitized filename
 */
sanitizeFileName(name) {
  return (name || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100) || 'untitled';
}
```

- [ ] **Step 8: Commit**

```bash
git add electron/services/bruno-converter.js
git commit -m "feat: add Bruno export to BrunoConverter"
```

---

## Chunk 2: IPC Channels and Backend Handlers

### Task 3: Add IPC Channel Types

**Files:**
- Modify: `shared/ipc-types.ts`

- [ ] **Step 1: Add export channel constants**

Add to `IPC_CHANNELS` object (around line 66, after `IMPORT_BRUNO`):

```typescript
  // Export to external formats
  EXPORT_POSTMAN: 'export-postman',
  EXPORT_POSTMAN_ENV: 'export-postman-env',
  EXPORT_BRUNO: 'export-bruno',
```

- [ ] **Step 2: Add request types**

Add to `IpcRequestMap` interface (around line 173, after `IMPORT_BRUNO`):

```typescript
  [IPC_CHANNELS.EXPORT_POSTMAN]: { collectionPath: string; targetPath: string };
  [IPC_CHANNELS.EXPORT_POSTMAN_ENV]: { collectionPath: string; envId: string; targetPath: string };
  [IPC_CHANNELS.EXPORT_BRUNO]: { collectionPath: string; targetPath: string };
```

- [ ] **Step 3: Add response types**

Add to `IpcResponseMap` interface (around line 219, after `IMPORT_BRUNO`):

```typescript
  [IPC_CHANNELS.EXPORT_POSTMAN]: ExportResult;
  [IPC_CHANNELS.EXPORT_POSTMAN_ENV]: ExportResult;
  [IPC_CHANNELS.EXPORT_BRUNO]: BrunoExportResult;
```

- [ ] **Step 4: Add export result types**

Add after `FileFormat` type definition (around line 246):

```typescript
// Export result types
export interface ExportResult {
  filePath: string;
}

export interface BrunoExportResult {
  folderPath: string;
  stats: {
    requests: number;
    folders: number;
    environments: number;
    skipped: Array<{ name: string; reason: string }>;
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-types.ts
git commit -m "feat: add IPC types for Postman/Bruno export"
```

---

### Task 4: Add Export IPC Handlers

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Add export-postman handler**

Add after the `import-bruno` handler (around line 545):

```javascript
// Export to Postman collection
ipcMain.handle(
  'export-postman',
  wrapHandler(async (event, args) => {
    const { collectionPath, targetPath } = args;
    const fs = require('fs/promises');

    // Read the Nikode collection
    const collection = await fileService.readCollection(collectionPath);

    // Convert to Postman format
    const postmanCollection = postmanConverter.exportToPostman(collection);

    // Write the file
    await fs.writeFile(targetPath, JSON.stringify(postmanCollection, null, 2), 'utf-8');

    return { filePath: targetPath };
  }),
);
```

- [ ] **Step 2: Add export-postman-env handler**

```javascript
// Export Postman environment
ipcMain.handle(
  'export-postman-env',
  wrapHandler(async (event, args) => {
    const { collectionPath, envId, targetPath } = args;
    const fs = require('fs/promises');

    // Read the Nikode collection
    const collection = await fileService.readCollection(collectionPath);

    // Find the environment
    const env = collection.environments?.find(e => e.id === envId);
    if (!env) {
      throw new Error(`Environment not found: ${envId}`);
    }

    // Convert to Postman environment format
    const postmanEnv = postmanConverter.exportEnvironment(env);

    // Write the file
    await fs.writeFile(targetPath, JSON.stringify(postmanEnv, null, 2), 'utf-8');

    return { filePath: targetPath };
  }),
);
```

- [ ] **Step 3: Add export-bruno handler**

```javascript
// Export to Bruno folder
ipcMain.handle(
  'export-bruno',
  wrapHandler(async (event, args) => {
    const { collectionPath, targetPath } = args;
    const fs = require('fs/promises');

    // Read the Nikode collection
    const collection = await fileService.readCollection(collectionPath);

    // Check if target folder exists
    try {
      await fs.access(targetPath);
      // Folder exists - remove it for clean export
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch {
      // Folder doesn't exist, good to go
    }

    // Export to Bruno format
    const stats = await brunoConverter.exportToBruno(collection, targetPath);

    return { folderPath: targetPath, stats };
  }),
);
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.js
git commit -m "feat: add IPC handlers for Postman/Bruno export"
```

---

### Task 5: Update Preload Script

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Add export channels to allowlist**

Add to `ALLOWED_CHANNELS` array (around line 31, after `'import-bruno'`):

```javascript
  'export-postman',
  'export-postman-env',
  'export-bruno',
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add export channels to preload allowlist"
```

---

## Chunk 3: Export Dialog UI

### Task 6: Rewrite Export Dialog as Card-Based UI

**Files:**
- Modify: `src/app/shared/dialogs/export-collection.dialog.ts`

- [ ] **Step 1: Update imports and types**

Replace the entire file with:

```typescript
import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  CheckboxComponent,
  RadioGroupComponent,
  RadioComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface ExportCollectionDialogData {
  collectionName: string;
  hasScripts: boolean;
}

export type ExportFormat = 'nikode' | 'postman' | 'bruno' | 'openapi';

export interface ExportDialogResult {
  format: ExportFormat;
  options: {
    includeEnvironments?: boolean;
    openapiFormat?: 'json' | 'yaml';
  };
}

@Component({
  selector: 'app-export-collection-dialog',
  imports: [
    ModalComponent,
    ButtonComponent,
    CheckboxComponent,
    RadioGroupComponent,
    RadioComponent
  ],
  template: `
    <ui-modal title="Export Collection" size="md">
      @if (mode() === 'select') {
        <p class="dialog-description">
          Export "{{ data.collectionName }}" to an external format.
        </p>

        @if (data.hasScripts) {
          <div class="script-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>This collection contains scripts that use nk.* API. Manual conversion may be needed.</span>
          </div>
        }

        <div class="format-grid">
          <button class="format-button" (click)="selectFormat('nikode')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <span class="format-label">Nikode</span>
            <span class="format-ext">.nikode.json</span>
          </button>
          <button class="format-button" (click)="selectFormat('postman')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <span class="format-label">Postman</span>
            <span class="format-ext">.postman_collection.json</span>
          </button>
          <button class="format-button" (click)="selectFormat('bruno')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span class="format-label">Bruno</span>
            <span class="format-ext">folder</span>
          </button>
          <button class="format-button" (click)="selectFormat('openapi')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span class="format-label">OpenAPI</span>
            <span class="format-ext">.yaml / .json</span>
          </button>
        </div>
      }

      @if (mode() === 'postman-options') {
        <p class="dialog-description">Postman export options</p>
        <div class="options-form">
          <ui-checkbox [(checked)]="includeEnvironments">
            Also export environments as separate file
          </ui-checkbox>
        </div>
      }

      @if (mode() === 'openapi-options') {
        <p class="dialog-description">OpenAPI export format</p>
        <ui-radio-group [(value)]="openapiFormat" label="Format">
          <ui-radio value="yaml">YAML</ui-radio>
          <ui-radio value="json">JSON</ui-radio>
        </ui-radio-group>
      }

      <ng-container footer>
        @if (mode() === 'select') {
          <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        } @else {
          <ui-button variant="ghost" (clicked)="backToSelect()">Back</ui-button>
          <ui-button color="primary" (clicked)="confirm()">Export</ui-button>
        }
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .dialog-description {
      margin: 0 0 1rem 0;
      color: var(--ui-text-secondary);
      font-size: var(--ui-font-sm);
    }

    .script-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
      margin-bottom: 1rem;
      background: var(--ui-warning-subtle, rgba(245, 158, 11, 0.1));
      border: 1px solid var(--ui-warning, #f59e0b);
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: var(--ui-warning, #f59e0b);

      svg {
        flex-shrink: 0;
        margin-top: 0.125rem;
      }
    }

    .format-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .format-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 0.5rem;
      background: var(--ui-bg);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--ui-primary);
        background: var(--ui-bg-hover);
      }
    }

    .format-icon {
      color: var(--ui-text-muted);
    }

    .format-button:hover .format-icon {
      color: var(--ui-primary);
    }

    .format-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .format-ext {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .options-form {
      padding: 0.5rem 0;
    }
  `]
})
export class ExportCollectionDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ExportDialogResult | undefined>;
  readonly data = inject(DIALOG_DATA) as ExportCollectionDialogData;

  mode = signal<'select' | 'postman-options' | 'openapi-options'>('select');
  selectedFormat = signal<ExportFormat>('nikode');
  includeEnvironments = signal(true);
  openapiFormat = signal<'json' | 'yaml'>('yaml');

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  backToSelect(): void {
    this.mode.set('select');
  }

  selectFormat(format: ExportFormat): void {
    this.selectedFormat.set(format);

    if (format === 'postman') {
      this.mode.set('postman-options');
    } else if (format === 'openapi') {
      this.mode.set('openapi-options');
    } else {
      // Nikode and Bruno: export immediately
      this.confirm();
    }
  }

  confirm(): void {
    this.dialogRef.close({
      format: this.selectedFormat(),
      options: {
        includeEnvironments: this.includeEnvironments(),
        openapiFormat: this.openapiFormat(),
      }
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/shared/dialogs/export-collection.dialog.ts
git commit -m "feat: rewrite export dialog as card-based UI"
```

---

### Task 7: Add Export Methods to ApiService

**Files:**
- Modify: `src/app/core/services/api.service.ts`

- [ ] **Step 1: Add export methods**

Add these methods to the ApiService class:

```typescript
exportPostman(collectionPath: string, targetPath: string): Promise<IpcResult<ExportResult>> {
  return this.invoke(IPC_CHANNELS.EXPORT_POSTMAN, { collectionPath, targetPath });
}

exportPostmanEnv(collectionPath: string, envId: string, targetPath: string): Promise<IpcResult<ExportResult>> {
  return this.invoke(IPC_CHANNELS.EXPORT_POSTMAN_ENV, { collectionPath, envId, targetPath });
}

exportBruno(collectionPath: string, targetPath: string): Promise<IpcResult<BrunoExportResult>> {
  return this.invoke(IPC_CHANNELS.EXPORT_BRUNO, { collectionPath, targetPath });
}
```

- [ ] **Step 3: Add imports for new types**

Add to imports:

```typescript
import { ExportResult, BrunoExportResult } from '@shared/ipc-types';
```

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/api.service.ts
git commit -m "feat: add export methods to ApiService"
```

---

### Task 8: Update Sidebar Export Handler

**Files:**
- Modify: `src/app/features/sidebar/sidebar.component.ts`

- [ ] **Step 1: Update import for export dialog**

Update the import:

```typescript
import {
  ExportCollectionDialogComponent,
  ExportCollectionDialogData,
  ExportDialogResult
} from '../../shared/dialogs/export-collection.dialog';
```

- [ ] **Step 2: Update exportCollection method**

Replace the `exportCollection` method:

```typescript
async exportCollection(nodeData: TreeNodeData): Promise<void> {
  const col = this.unifiedCollectionService.getCollection(nodeData.collectionPath);
  if (!col) return;

  // Cloud collections: sync instead of export
  if (nodeData.collectionPath.startsWith('cloud://')) {
    this.unifiedCollectionService.syncCloudCollection(nodeData.collectionPath);
    return;
  }

  // Check if collection has scripts
  const hasScripts = this.collectionHasScripts(col);

  const ref = this.dialogService.open<ExportCollectionDialogComponent, ExportCollectionDialogData, ExportDialogResult | undefined>(
    ExportCollectionDialogComponent,
    { data: { collectionName: col.name, hasScripts } }
  );
  const result = await ref.afterClosed();
  if (!result) return;

  switch (result.format) {
    case 'nikode':
      await this.collectionService.exportCollection(nodeData.collectionPath, 'json');
      break;
    case 'openapi':
      await this.collectionService.exportOpenApi(nodeData.collectionPath, result.options.openapiFormat);
      break;
    case 'postman':
      await this.exportToPostman(nodeData.collectionPath, col, result.options.includeEnvironments);
      break;
    case 'bruno':
      await this.exportToBruno(nodeData.collectionPath, col);
      break;
  }
}

private collectionHasScripts(collection: Collection): boolean {
  const checkItems = (items: CollectionItem[]): boolean => {
    for (const item of items) {
      if (item.type === 'folder' && item.items) {
        if (checkItems(item.items)) return true;
      } else if (item.scripts?.pre || item.scripts?.post) {
        return true;
      }
    }
    return false;
  };
  return checkItems(collection.items || []);
}

private async exportToPostman(collectionPath: string, collection: Collection, includeEnv?: boolean): Promise<void> {
  const defaultFileName = collection.name.toLowerCase().replace(/\s+/g, '-') + '.postman_collection.json';

  const result = await this.api.showSaveDialog({
    title: 'Export to Postman',
    defaultPath: defaultFileName,
    filters: [{ name: 'Postman Collection', extensions: ['json'] }]
  });

  if (isIpcError(result) || result.data.canceled || !result.data.filePath) return;

  const exportResult = await this.api.exportPostman(collectionPath, result.data.filePath);
  if (isIpcError(exportResult)) {
    this.toastService.error('Export failed: ' + exportResult.error.userMessage);
    return;
  }

  // Export environments if requested
  if (includeEnv && collection.environments?.length > 0) {
    for (const env of collection.environments) {
      const envFileName = env.name.toLowerCase().replace(/\s+/g, '-') + '.postman_environment.json';
      const envResult = await this.api.showSaveDialog({
        title: `Export Environment: ${env.name}`,
        defaultPath: envFileName,
        filters: [{ name: 'Postman Environment', extensions: ['json'] }]
      });

      if (!isIpcError(envResult) && !envResult.data.canceled && envResult.data.filePath) {
        await this.api.exportPostmanEnv(collectionPath, env.id, envResult.data.filePath);
      }
    }
  }

  this.toastService.success('Exported to Postman format');
}

private async exportToBruno(collectionPath: string, collection: Collection): Promise<void> {
  const result = await this.api.showOpenDialog({
    title: 'Select folder for Bruno export',
    properties: ['openDirectory', 'createDirectory']
  });

  if (isIpcError(result) || result.data.canceled || !result.data.filePaths[0]) return;

  const targetFolder = result.data.filePaths[0];
  const brunoFolder = `${targetFolder}/${collection.name.replace(/\s+/g, '-')}`;

  const exportResult = await this.api.exportBruno(collectionPath, brunoFolder);
  if (isIpcError(exportResult)) {
    this.toastService.error('Export failed: ' + exportResult.error.userMessage);
    return;
  }

  const stats = exportResult.data.stats;
  let message = `Exported ${stats.requests} requests, ${stats.folders} folders`;
  if (stats.environments > 0) {
    message += `, ${stats.environments} environments`;
  }
  if (stats.skipped.length > 0) {
    message += `. ${stats.skipped.length} items skipped.`;
  }

  this.toastService.success(message);
}
```

- [ ] **Step 3: Add missing imports**

Add to imports at top of file (if not already present):

```typescript
import { Collection, CollectionItem } from '../../core/models/collection.model';
import { isIpcError } from '@shared/ipc-types';
```

- [ ] **Step 4: Commit**

```bash
git add src/app/features/sidebar/sidebar.component.ts
git commit -m "feat: update sidebar to use new export dialog and handlers"
```

---

## Chunk 4: Integration and Testing

### Task 9: Manual Integration Test

**Files:**
- None (manual testing)

- [ ] **Step 1: Build and run the application**

```bash
npm run electron:dev
```

- [ ] **Step 2: Test Nikode export**

1. Right-click a collection
2. Click "Export"
3. Select "Nikode"
4. Choose save location
5. Verify `.nikode.json` file is created

- [ ] **Step 3: Test Postman export**

1. Right-click a collection with requests
2. Click "Export"
3. Select "Postman"
4. Check "Also export environments"
5. Choose save locations
6. Verify `.postman_collection.json` is created
7. Import in Postman to validate format

- [ ] **Step 4: Test Bruno export**

1. Right-click a collection with folders and requests
2. Click "Export"
3. Select "Bruno"
4. Choose target folder
5. Verify folder structure is created with `.bru` files
6. Open in Bruno to validate format

- [ ] **Step 5: Test script warning**

1. Add a pre-request script to a request
2. Export to Postman
3. Verify warning appears in dialog
4. Verify exported script has warning comment header

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration test issues"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run linting**

```bash
npm run lint
```

- [ ] **Step 2: Run type checking**

```bash
npm run build
```

- [ ] **Step 3: Create final commit if there are changes**

```bash
# Only commit if there are staged changes from fixes
git diff --staged --quiet || git commit -m "fix: address final review issues"
```

---

## Summary

**Phase 1 Complete:**
- Postman export with collection and environment support
- Bruno folder export with full structure
- Card-based export dialog
- Script warnings for manual conversion

**Phase 2 (Future):**
- Script conversion engine (`script-converter.js`)
- Bi-directional nk.* ↔ pm.* ↔ bru.* conversion
- Integration with import flow

# Unified Collection Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate "Open Collection" and "New Collection" buttons with a single unified "Add Collection" dialog that supports explicit format selection (New, OpenAPI, Postman, Bruno) for both local and cloud collections.

**Architecture:** The dialog presents a Local/Cloud toggle and a 2x2 grid of format buttons. Each button triggers the appropriate OS picker (file or folder) and routes to the corresponding converter. The Bruno converter is new and parses `.bru` files from a folder structure.

**Tech Stack:** Angular 19, @m1z23r/ngx-ui components, Electron IPC, Node.js file operations

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/features/sidebar/sidebar.component.ts` | Replace two buttons with single "Add Collection" button, update dialog handling |
| Rewrite | `src/app/features/sidebar/dialogs/open-collection.dialog.ts` | Unified "Add Collection" dialog with format grid |
| Delete | `src/app/features/sidebar/dialogs/new-collection.dialog.ts` | Merged into open-collection.dialog.ts |
| Modify | `src/app/core/services/collection.service.ts` | Add `importBruno()` method, simplify dialog flow |
| Modify | `src/app/core/services/api.service.ts` | Add `importBruno()` IPC call |
| Modify | `shared/ipc-types.ts` | Add Bruno IPC channel and types |
| Modify | `electron/main.js` | Add Bruno import IPC handler |
| Create | `electron/services/bruno-converter.js` | Bruno collection parser and converter |

---

## Chunk 1: Bruno Converter Backend

### Task 1: Create Bruno Converter - BRU Parser

**Files:**
- Create: `electron/services/bruno-converter.js`

- [ ] **Step 1: Create bruno-converter.js with basic structure**

```javascript
const fs = require('fs/promises');
const path = require('path');

/**
 * Bruno Converter
 * Handles import of Bruno collection folders (.bru files)
 */
class BrunoConverter {
  /**
   * Parse a .bru file content into an object
   * @param {string} content - Raw .bru file content
   * @returns {object} Parsed blocks
   */
  parseBruFile(content) {
    const result = {
      meta: {},
      http: null,
      headers: {},
      query: [],
      body: null,
      auth: null,
      vars: [],
      script: { pre: '', post: '' }
    };

    const lines = content.split('\n');
    let currentBlock = null;
    let currentBlockName = null;
    let blockContent = [];
    let braceDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect block start: "blockname {" or "blockname:subtype {"
      const blockMatch = trimmed.match(/^([\w:-]+)\s*\{$/);
      if (blockMatch && braceDepth === 0) {
        currentBlock = blockMatch[1];
        currentBlockName = currentBlock;
        braceDepth = 1;
        blockContent = [];
        continue;
      }

      // Track nested braces
      if (braceDepth > 0) {
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        if (braceDepth === 0) {
          // Block ended
          this.processBlock(result, currentBlockName, blockContent);
          currentBlock = null;
          currentBlockName = null;
          blockContent = [];
        } else {
          blockContent.push(line);
        }
      }
    }

    return result;
  }

  /**
   * Process a parsed block into the result object
   */
  processBlock(result, blockName, lines) {
    const content = lines.join('\n').trim();

    if (blockName === 'meta') {
      result.meta = this.parseKeyValueBlock(lines);
    } else if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(blockName)) {
      result.http = {
        method: blockName.toUpperCase(),
        ...this.parseKeyValueBlock(lines)
      };
    } else if (blockName === 'headers') {
      result.headers = this.parseKeyValueBlock(lines);
    } else if (blockName === 'query') {
      result.query = this.parseKeyValuePairs(lines);
    } else if (blockName === 'body:json') {
      result.body = { type: 'json', content };
    } else if (blockName === 'body:text') {
      result.body = { type: 'text', content };
    } else if (blockName === 'body:xml') {
      result.body = { type: 'xml', content };
    } else if (blockName === 'body:form-urlencoded') {
      result.body = { type: 'urlencoded', entries: this.parseKeyValuePairs(lines) };
    } else if (blockName === 'body:multipart-form') {
      result.body = { type: 'formdata', entries: this.parseKeyValuePairs(lines) };
    } else if (blockName === 'body:graphql') {
      result.body = { type: 'graphql', content };
    } else if (blockName === 'body:graphql:vars') {
      if (result.body && result.body.type === 'graphql') {
        result.body.variables = content;
      }
    } else if (blockName === 'auth:bearer') {
      result.auth = { type: 'bearer', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'auth:basic') {
      result.auth = { type: 'basic', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'auth:apikey') {
      result.auth = { type: 'apikey', ...this.parseKeyValueBlock(lines) };
    } else if (blockName === 'vars') {
      result.vars = this.parseKeyValuePairs(lines);
    } else if (blockName === 'vars:secret') {
      result.vars.push(...this.parseKeyValuePairs(lines).map(v => ({ ...v, secret: true })));
    } else if (blockName === 'script:pre-request') {
      result.script.pre = content;
    } else if (blockName === 'script:post-response') {
      result.script.post = content;
    }
  }

  /**
   * Parse key: value lines into an object
   */
  parseKeyValueBlock(lines) {
    const result = {};
    for (const line of lines) {
      const match = line.trim().match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    return result;
  }

  /**
   * Parse key: value lines into array of {key, value, enabled}
   */
  parseKeyValuePairs(lines) {
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for disabled entries (prefixed with ~)
      const disabled = trimmed.startsWith('~');
      const cleanLine = disabled ? trimmed.slice(1).trim() : trimmed;

      const match = cleanLine.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        result.push({
          key: match[1],
          value: match[2],
          enabled: !disabled
        });
      }
    }
    return result;
  }
}

module.exports = { BrunoConverter };
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la electron/services/bruno-converter.js`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add electron/services/bruno-converter.js
git commit -m "feat: add Bruno converter with BRU file parser"
```

---

### Task 2: Add Folder Walker and Collection Converter

**Files:**
- Modify: `electron/services/bruno-converter.js`

- [ ] **Step 1: Add folder walker and main import method**

Append to `BrunoConverter` class (before the closing `}`):

```javascript
  /**
   * Import a Bruno collection folder and convert to Nikode Collection
   * @param {string} folderPath - Path to the Bruno collection folder
   * @returns {Promise<object>} Nikode Collection object
   */
  async importFromBruno(folderPath) {
    // Read bruno.json for collection metadata
    const brunoJsonPath = path.join(folderPath, 'bruno.json');
    let collectionName = path.basename(folderPath);

    try {
      const brunoJson = JSON.parse(await fs.readFile(brunoJsonPath, 'utf-8'));
      collectionName = brunoJson.name || collectionName;
    } catch (e) {
      // bruno.json is optional, use folder name
    }

    // Build environments from environments/ folder
    const environments = await this.loadEnvironments(folderPath);
    if (environments.length === 0) {
      environments.push({
        id: 'env-default',
        name: 'default',
        variables: []
      });
    }

    // Recursively build items from folder structure
    const items = await this.loadItems(folderPath, folderPath);

    return {
      name: collectionName,
      version: '1.0.0',
      environments,
      activeEnvironmentId: environments[0].id,
      items
    };
  }

  /**
   * Load environments from the environments/ folder
   */
  async loadEnvironments(folderPath) {
    const envDir = path.join(folderPath, 'environments');
    const environments = [];

    try {
      const files = await fs.readdir(envDir);
      for (const file of files) {
        if (!file.endsWith('.bru')) continue;

        const content = await fs.readFile(path.join(envDir, file), 'utf-8');
        const parsed = this.parseBruFile(content);

        const envName = path.basename(file, '.bru');
        environments.push({
          id: `env-${this.slugify(envName)}-${Date.now()}`,
          name: envName,
          variables: parsed.vars.map(v => ({
            key: v.key,
            value: v.value,
            enabled: v.enabled !== false,
            ...(v.secret ? { secret: true } : {})
          }))
        });
      }
    } catch (e) {
      // environments folder doesn't exist or is empty
    }

    return environments;
  }

  /**
   * Recursively load items from a folder
   */
  async loadItems(rootPath, currentPath) {
    const items = [];
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    // Sort entries: folders first, then files, both alphabetically
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      const entryPath = path.join(currentPath, entry.name);

      // Skip special folders
      if (entry.name === 'environments' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        // It's a folder - recurse
        const folderItems = await this.loadItems(rootPath, entryPath);

        // Read folder.bru for metadata if it exists
        let folderName = entry.name;
        try {
          const folderBru = await fs.readFile(path.join(entryPath, 'folder.bru'), 'utf-8');
          const parsed = this.parseBruFile(folderBru);
          if (parsed.meta.name) {
            folderName = parsed.meta.name;
          }
        } catch (e) {
          // No folder.bru, use directory name
        }

        items.push({
          id: `folder-${this.slugify(folderName)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'folder',
          name: folderName,
          items: folderItems
        });
      } else if (entry.name.endsWith('.bru') && entry.name !== 'folder.bru') {
        // It's a request file
        const content = await fs.readFile(entryPath, 'utf-8');
        const request = this.convertRequest(content, entry.name);
        if (request) {
          items.push(request);
        }
      }
    }

    // Sort by sequence number if available
    items.sort((a, b) => {
      const seqA = a._seq || 999;
      const seqB = b._seq || 999;
      return seqA - seqB;
    });

    // Remove _seq from final output
    items.forEach(item => delete item._seq);

    return items;
  }

  /**
   * Convert a parsed .bru file to a Nikode request item
   */
  convertRequest(content, fileName) {
    const parsed = this.parseBruFile(content);

    if (!parsed.http) {
      return null; // Not a valid request file
    }

    const name = parsed.meta.name || path.basename(fileName, '.bru');
    const id = `req-${this.slugify(name)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const request = {
      id,
      type: parsed.meta.type === 'graphql' ? 'graphql' : 'request',
      name,
      method: parsed.http.method,
      url: parsed.http.url || '',
      _seq: parseInt(parsed.meta.seq, 10) || 999
    };

    // Headers
    if (Object.keys(parsed.headers).length > 0) {
      request.headers = Object.entries(parsed.headers).map(([key, value]) => ({
        key,
        value,
        enabled: true
      }));
    }

    // Query params
    if (parsed.query.length > 0) {
      request.params = parsed.query;
    }

    // Body
    if (parsed.body) {
      request.body = this.convertBody(parsed.body);
    }

    // Auth
    if (parsed.auth) {
      request.auth = this.convertAuth(parsed.auth);
    }

    // Scripts
    if (parsed.script.pre || parsed.script.post) {
      request.scripts = {
        pre: parsed.script.pre,
        post: parsed.script.post
      };
    }

    // GraphQL specific
    if (parsed.meta.type === 'graphql' && parsed.body?.type === 'graphql') {
      request.gqlQuery = parsed.body.content;
      request.gqlVariables = parsed.body.variables || '';
    }

    return request;
  }

  /**
   * Convert Bruno body to Nikode body format
   */
  convertBody(body) {
    switch (body.type) {
      case 'json':
        return { type: 'json', content: body.content };
      case 'text':
        return { type: 'raw', content: body.content };
      case 'xml':
        return { type: 'xml', content: body.content };
      case 'urlencoded':
        return {
          type: 'urlencoded',
          entries: body.entries.map(e => ({ key: e.key, value: e.value, enabled: e.enabled }))
        };
      case 'formdata':
        return {
          type: 'form-data',
          entries: body.entries.map(e => ({ key: e.key, value: e.value, enabled: e.enabled, type: 'text' }))
        };
      case 'graphql':
        return { type: 'graphql', query: body.content, variables: body.variables || '' };
      default:
        return null;
    }
  }

  /**
   * Convert Bruno auth to Nikode auth format
   */
  convertAuth(auth) {
    switch (auth.type) {
      case 'bearer':
        return { type: 'bearer', token: auth.token || '' };
      case 'basic':
        return { type: 'basic', username: auth.username || '', password: auth.password || '' };
      case 'apikey':
        return {
          type: 'apikey',
          key: auth.key || '',
          value: auth.value || '',
          addTo: auth.placement === 'queryparams' ? 'query' : 'header'
        };
      default:
        return null;
    }
  }

  /**
   * Create a URL-safe slug from a string
   */
  slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

module.exports = { BrunoConverter };
```

**Note:** This code replaces the entire file content from Task 1. The `module.exports` line closes the class and exports it.

- [ ] **Step 2: Verify changes**

Run: `grep -n "importFromBruno" electron/services/bruno-converter.js`
Expected: Method found

- [ ] **Step 3: Commit**

```bash
git add electron/services/bruno-converter.js
git commit -m "feat: add Bruno folder walker and collection converter"
```

---

### Task 3: Add Bruno IPC Handler

**Files:**
- Modify: `shared/ipc-types.ts`
- Modify: `electron/main.js`

- [ ] **Step 1: Add IPC channel constant to shared/ipc-types.ts**

Find the `IPC_CHANNELS` object and add Bruno channel:

```typescript
  IMPORT_BRUNO: 'import-bruno',
```

- [ ] **Step 2: Add response type**

Find the `IpcResponseMap` interface (search for `interface IpcResponseMap` or the section where other `[IPC_CHANNELS.IMPORT_*]` types are defined) and add inside the interface:

```typescript
  [IPC_CHANNELS.IMPORT_BRUNO]: { path: string; collection: any };
```

- [ ] **Step 3: Add IPC handler in electron/main.js**

Find the import handlers section (near `ipcMain.handle('import-postman'`) and add:

```javascript
ipcMain.handle('import-bruno', wrapHandler(async (event, args) => {
  const { sourcePath, targetPath } = args;
  const collection = await brunoConverter.importFromBruno(sourcePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fileService.writeCollection(targetPath, collection);
  await secretsService.addRecentPath(targetPath);
  return { path: targetPath, collection };
}));
```

- [ ] **Step 4: Add BrunoConverter require at top of main.js**

```javascript
const { BrunoConverter } = require('./services/bruno-converter');
const brunoConverter = new BrunoConverter();
```

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-types.ts electron/main.js
git commit -m "feat: add Bruno import IPC handler"
```

---

## Chunk 2: Angular Service Layer

### Task 4: Add Bruno Import to API Service

**Files:**
- Modify: `src/app/core/services/api.service.ts`

- [ ] **Step 1: Add importBruno method**

Find the import methods section (near `importPostman`) and add:

```typescript
  async importBruno(sourcePath: string, targetPath: string): Promise<IpcResult<{ path: string; collection: any }>> {
    return this.invoke(IPC_CHANNELS.IMPORT_BRUNO, { sourcePath, targetPath });
  }
```

- [ ] **Step 2: Verify method was added**

Run: `grep -n "importBruno" src/app/core/services/api.service.ts`
Expected: Method found

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/api.service.ts
git commit -m "feat: add Bruno import to API service"
```

---

### Task 5: Add Bruno Import to Collection Service

**Files:**
- Modify: `src/app/core/services/collection.service.ts`

- [ ] **Step 1: Add importBruno method**

Find the import methods section (near `importPostman`) and add:

```typescript
  /**
   * Import a Bruno collection folder to target path
   */
  async importBruno(sourcePath: string, targetPath: string): Promise<boolean> {
    const result = await this.api.importBruno(sourcePath, targetPath);

    if (isIpcError(result)) {
      this.toastService.error(`Failed to import Bruno collection: ${result.error.message}`);
      return false;
    }

    this.addOpenCollection(result.data.path, result.data.collection);
    this.toastService.success('Collection imported successfully');
    return true;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/core/services/collection.service.ts
git commit -m "feat: add Bruno import to collection service"
```

---

## Chunk 3: Unified Add Collection Dialog

### Task 6: Rewrite Open Collection Dialog

**Files:**
- Rewrite: `src/app/features/sidebar/dialogs/open-collection.dialog.ts`

- [ ] **Step 1: Replace entire file with new unified dialog**

```typescript
import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  RadioGroupComponent,
  RadioComponent,
  AsyncSearchFn,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { CloudWorkspaceService } from '../../../core/services/cloud-workspace.service';
import { TemplateService } from '../../../core/services/template.service';

export type ImportFormat = 'new' | 'openapi' | 'postman' | 'bruno';
export type StorageType = 'local' | 'cloud';

export interface AddCollectionDialogResult {
  action: 'new' | 'import';
  storageType: StorageType;
  // For 'new' action
  name?: string;
  path?: string;
  workspaceId?: string;
  templateId?: string;
  // For 'import' action
  format?: ImportFormat;
  sourcePath?: string;
  targetPath?: string;
}

@Component({
  selector: 'app-add-collection-dialog',
  imports: [
    ModalComponent,
    ButtonComponent,
    InputComponent,
    SelectComponent,
    OptionComponent,
    RadioGroupComponent,
    RadioComponent
  ],
  template: `
    <ui-modal title="Add Collection" size="sm">
      <!-- Storage Type Toggle -->
      <div class="storage-toggle">
        <button
          class="toggle-button"
          [class.active]="storageType() === 'local'"
          (click)="storageType.set('local')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Local
        </button>
        <button
          class="toggle-button"
          [class.active]="storageType() === 'cloud'"
          [class.disabled]="!canUseCloud()"
          (click)="canUseCloud() && storageType.set('cloud')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
          Cloud
        </button>
      </div>

      @if (!canUseCloud() && storageType() === 'local') {
        <p class="hint-text">Sign in to create cloud collections</p>
      }

      @if (mode() === 'select') {
        <!-- Format Selection Grid -->
        <div class="format-grid">
          <button class="format-button" (click)="selectFormat('new')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <span class="format-label">New</span>
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
          </button>
          <button class="format-button" (click)="selectFormat('postman')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <span class="format-label">Postman</span>
          </button>
          <button class="format-button" (click)="selectFormat('bruno')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </div>
            <span class="format-label">Bruno</span>
          </button>
        </div>
      } @else if (mode() === 'new') {
        <!-- New Collection Form -->
        <div class="form-fields">
          <ui-input
            label="Collection Name"
            [(value)]="name"
            placeholder="My API Collection" />

          <ui-select
            label="Start from template (optional)"
            placeholder="Search templates..."
            [cacheAsyncResults]="true"
            [initialLoad]="true"
            [(value)]="selectedTemplateId"
            [searchable]="true"
            [asyncSearch]="templateSearch"
          />

          @if (storageType() === 'cloud') {
            <ui-select label="Workspace" [(value)]="selectedWorkspaceId">
              @for (workspace of workspaces(); track workspace.id) {
                <ui-option [value]="workspace.id">{{ workspace.name }}</ui-option>
              }
            </ui-select>
          }
        </div>

        <ng-container footer>
          <ui-button variant="ghost" (clicked)="backToSelect()">Back</ui-button>
          <ui-button color="primary" (clicked)="createNew()" [disabled]="!isNewValid()">Create</ui-button>
        </ng-container>
      }

      @if (mode() === 'select') {
        <ng-container footer>
          <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        </ng-container>
      }
    </ui-modal>
  `,
  styles: [`
    .storage-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .toggle-button {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 0.375rem;
      background: var(--ui-bg);
      color: var(--ui-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 0.875rem;

      &:hover:not(.disabled) {
        border-color: var(--ui-primary);
        color: var(--ui-text);
      }

      &.active {
        border-color: var(--ui-primary);
        background: var(--ui-primary-subtle, rgba(59, 130, 246, 0.1));
        color: var(--ui-primary);
      }

      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .hint-text {
      margin: 0 0 1rem;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      text-align: center;
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

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `]
})
export class AddCollectionDialogComponent {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private templateService = inject(TemplateService);
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<AddCollectionDialogResult | undefined>;

  storageType = signal<StorageType>('local');
  mode = signal<'select' | 'new'>('select');
  name = signal('');
  selectedWorkspaceId = signal('');
  selectedTemplateId = signal<string | null>(null);

  workspaces = this.cloudWorkspaceService.workspaces;

  templateSearch: AsyncSearchFn<string> = async (query: string) => {
    const results = await this.templateService.search(query);
    return results.map(t => ({ value: t.id, label: t.name }));
  };

  constructor() {
    const workspaceList = this.cloudWorkspaceService.workspaces();
    if (workspaceList.length > 0) {
      this.selectedWorkspaceId.set(workspaceList[0].id);
    }
  }

  canUseCloud(): boolean {
    return this.authService.isAuthenticated() && this.cloudWorkspaceService.workspaces().length > 0;
  }

  isNewValid = computed(() => {
    const nameValid = this.name().trim().length > 0;
    if (this.storageType() === 'local') {
      return nameValid;
    }
    return nameValid && this.selectedWorkspaceId().length > 0;
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  backToSelect(): void {
    this.mode.set('select');
  }

  async selectFormat(format: ImportFormat): Promise<void> {
    if (format === 'new') {
      this.mode.set('new');
      return;
    }

    // Close dialog and return format for import
    // The actual file picking happens in the sidebar/service
    this.dialogRef.close({
      action: 'import',
      storageType: this.storageType(),
      format
    });
  }

  async createNew(): Promise<void> {
    if (!this.isNewValid()) return;

    if (this.storageType() === 'local') {
      const name = this.name().trim();
      const defaultFileName = name.toLowerCase().replace(/\s+/g, '-') + '.nikode.json';

      const result = await this.api.showSaveDialog({
        title: 'Save New Collection',
        defaultPath: defaultFileName,
        filters: [
          { name: 'Nikode Collections', extensions: ['nikode.json'] }
        ]
      });

      if (isIpcError(result) || result.data.canceled || !result.data.filePath) {
        return;
      }

      this.dialogRef.close({
        action: 'new',
        storageType: 'local',
        name,
        path: result.data.filePath,
        templateId: this.selectedTemplateId() ?? undefined
      });
    } else {
      this.dialogRef.close({
        action: 'new',
        storageType: 'cloud',
        name: this.name().trim(),
        workspaceId: this.selectedWorkspaceId(),
        templateId: this.selectedTemplateId() ?? undefined
      });
    }
  }
}

// Keep old export for backwards compatibility during migration
export { AddCollectionDialogComponent as OpenCollectionDialogComponent };
export type { AddCollectionDialogResult as OpenCollectionDialogResult };
```

- [ ] **Step 2: Commit**

```bash
git add src/app/features/sidebar/dialogs/open-collection.dialog.ts
git commit -m "feat: rewrite open-collection dialog as unified add-collection dialog"
```

---

### Task 7: Delete New Collection Dialog

**Files:**
- Delete: `src/app/features/sidebar/dialogs/new-collection.dialog.ts`

- [ ] **Step 1: Delete the file**

```bash
rm src/app/features/sidebar/dialogs/new-collection.dialog.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: remove new-collection dialog (merged into add-collection)"
```

---

## Chunk 4: Sidebar Integration

### Task 8: Update Sidebar Component

**Files:**
- Modify: `src/app/features/sidebar/sidebar.component.ts`

- [ ] **Step 1: Update imports**

Replace the NewCollectionDialog import with:

```typescript
import { AddCollectionDialogComponent, AddCollectionDialogResult } from './dialogs/open-collection.dialog';
```

Remove the line:
```typescript
import { NewCollectionDialogComponent, NewCollectionDialogResult } from './dialogs/new-collection.dialog';
```

Verify that the following imports already exist (they should, but confirm):
- `import { isIpcError } from '@shared/ipc-types';`
- `ApiService` is injected (already exists as `private api = inject(ApiService)`)
- `TemplateService` is injected (already exists)
- `UnifiedCollectionService` is injected (already exists)

If `isIpcError` is not imported, add it.

- [ ] **Step 2: Replace the two header buttons with single button**

Find the sidebar-actions div (around line 49-68) and replace:

```html
        <div class="sidebar-actions">
          <ui-button variant="ghost" size="sm" (clicked)="toggleSearch()" title="Search Collections"
                     [class.search-active]="searchActive()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </ui-button>
          <ui-button variant="ghost" size="sm" (clicked)="addCollection()" title="Add Collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </ui-button>
        </div>
```

- [ ] **Step 3: Replace openCollection and openNewDialog methods with single addCollection method**

Remove both `openCollection()` and `openNewDialog()` methods and replace with:

```typescript
  async addCollection(): Promise<void> {
    const ref = this.dialogService.open<AddCollectionDialogComponent, void, AddCollectionDialogResult | undefined>(
      AddCollectionDialogComponent
    );
    const result = await ref.afterClosed();

    if (!result) return;

    if (result.action === 'new') {
      // Handle new collection creation
      let templateData: any = null;
      if (result.templateId) {
        try {
          const template = await this.templateService.getById(result.templateId);
          templateData = template.data;
        } catch (error) {
          console.error('Failed to fetch template:', error);
          this.toastService.error('Failed to load template');
        }
      }

      if (result.storageType === 'cloud' && result.workspaceId) {
        await this.unifiedCollectionService.createCloudCollection(result.workspaceId, result.name!, templateData);
      } else if (result.path) {
        await this.collectionService.createCollection(result.path, result.name!, templateData);
      }
    } else if (result.action === 'import') {
      // Handle import based on format
      await this.handleImport(result);
    }
  }

  private async handleImport(result: AddCollectionDialogResult): Promise<void> {
    const format = result.format!;
    const isCloud = result.storageType === 'cloud';

    // Show appropriate picker based on format
    if (format === 'bruno') {
      // Folder picker for Bruno
      const folderResult = await this.api.showOpenDialog({
        title: 'Select Bruno Collection Folder',
        properties: ['openDirectory']
      });

      if (isIpcError(folderResult) || folderResult.data.canceled || folderResult.data.filePaths.length === 0) {
        return;
      }

      const sourcePath = folderResult.data.filePaths[0];
      await this.importWithDestination(sourcePath, 'bruno', isCloud, result.workspaceId);
    } else {
      // File picker for OpenAPI/Postman
      const fileResult = await this.api.showOpenDialog({
        title: `Select ${format === 'openapi' ? 'OpenAPI' : 'Postman'} File`,
        properties: ['openFile'],
        filters: [
          { name: 'Collection Files', extensions: ['json', 'yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (isIpcError(fileResult) || fileResult.data.canceled || fileResult.data.filePaths.length === 0) {
        return;
      }

      const sourcePath = fileResult.data.filePaths[0];

      // Auto-detect if it's actually a .nikode.json file
      if (sourcePath.endsWith('.nikode.json')) {
        await this.collectionService.openCollection(sourcePath);
        return;
      }

      await this.importWithDestination(sourcePath, format, isCloud, result.workspaceId);
    }
  }

  private async importWithDestination(
    sourcePath: string,
    format: 'openapi' | 'postman' | 'bruno',
    isCloud: boolean,
    workspaceId?: string
  ): Promise<void> {
    if (isCloud && workspaceId) {
      // For cloud: import to temp, then upload
      const tempPath = `/tmp/nikode-import-${Date.now()}.nikode.json`;

      let success = false;
      if (format === 'openapi') {
        const result = await this.collectionService.importOpenApi(sourcePath, tempPath);
        success = result.success;
      } else if (format === 'postman') {
        success = await this.collectionService.importPostman(sourcePath, tempPath);
      } else if (format === 'bruno') {
        success = await this.collectionService.importBruno(sourcePath, tempPath);
      }

      if (success) {
        // Read the imported collection and push to cloud
        const col = this.collectionService.getCollection(tempPath);
        if (col) {
          await this.unifiedCollectionService.createCloudCollection(workspaceId, col.collection.name, col.collection);
          await this.collectionService.closeCollection(tempPath);
        }
      }
    } else {
      // For local: show save dialog
      const targetResult = await this.api.showSaveDialog({
        title: 'Save Imported Collection As',
        defaultPath: 'imported.nikode.json',
        filters: [
          { name: 'Nikode Collections', extensions: ['nikode.json'] }
        ]
      });

      if (isIpcError(targetResult) || targetResult.data.canceled || !targetResult.data.filePath) {
        return;
      }

      const targetPath = targetResult.data.filePath;

      if (format === 'openapi') {
        const result = await this.collectionService.importOpenApi(sourcePath, targetPath);
        if (result.success) {
          await this.collectionService.offerSchemaImport(result.schemas, result.collectionPath);
        }
      } else if (format === 'postman') {
        await this.collectionService.importPostman(sourcePath, targetPath);
      } else if (format === 'bruno') {
        await this.collectionService.importBruno(sourcePath, targetPath);
      }
    }
  }
```

- [ ] **Step 4: Ensure offerSchemaImport is public in collection.service.ts**

Check if `offerSchemaImport` method is public. If it's private, make it public.

- [ ] **Step 5: Verify build succeeds before committing**

Run: `npm run build`
Expected: Build completes without errors

- [ ] **Step 6: Commit**

```bash
git add src/app/features/sidebar/sidebar.component.ts src/app/core/services/collection.service.ts
git commit -m "feat: integrate unified add-collection dialog into sidebar"
```

---

### Task 9: Final Cleanup and Testing

**Files:**
- Various

- [ ] **Step 1: Build the application to check for errors**

Run: `npm run build`
Expected: Build completes without errors

- [ ] **Step 2: Run linting**

Run: `npm run lint`
Expected: No errors (warnings OK)

- [ ] **Step 3: Test manually**

1. Click "Add Collection" button in sidebar
2. Verify Local/Cloud toggle works
3. Click "New" - verify form appears with back button
4. Click "OpenAPI" - verify file picker opens
5. Click "Bruno" - verify folder picker opens
6. Import a Postman collection
7. Import an OpenAPI spec
8. Create a new local collection
9. Create a new cloud collection (if signed in)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete unified collection import implementation"
```

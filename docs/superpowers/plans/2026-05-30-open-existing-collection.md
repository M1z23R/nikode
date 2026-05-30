# Open Existing Nikode Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discoverable "Open" tile to the Add Collection dialog that opens an existing `.nikode.json` collection from local disk.

**Architecture:** The dialog (`open-collection.dialog.ts`) gains an "Open" tile shown only in Local storage mode. Clicking it runs a local file picker inside the dialog (mirroring the existing `createNew()` pattern) and closes with `{ action: 'open', sourcePath }`. The sidebar's `addCollection()` handles the new `'open'` action by calling the already-tested `collectionService.openCollection(path)`.

**Tech Stack:** Angular (signals, `@if`), `@m1z23r/ngx-ui` (`ui-modal`), Electron IPC via `ApiService.showOpenDialog`.

**Testing note:** This project has no component tests (vitest covers only services/utils). This change is pure UI wiring onto `collectionService.openCollection()`, which already works. Verification is manual via the running app.

---

### Task 1: Add the `'open'` action and Open tile to the dialog

**Files:**
- Modify: `src/app/features/sidebar/dialogs/open-collection.dialog.ts`

- [ ] **Step 1: Extend the result action union**

In `AddCollectionDialogResult`, change the `action` field type. Current (line ~22):

```ts
export interface AddCollectionDialogResult {
  action: 'new' | 'import';
```

Change to:

```ts
export interface AddCollectionDialogResult {
  action: 'new' | 'import' | 'open';
```

- [ ] **Step 2: Add the Open tile to the format grid**

In the template, the format grid is rendered inside `@if (mode() === 'select') { <div class="format-grid"> ... </div> }`. Add the Open tile as the **first** tile in the grid (before the "New" tile), wrapped so it only shows in local mode. Insert immediately after `<div class="format-grid">`:

```html
          @if (storageType() === 'local') {
            <button class="format-button" (click)="openExisting()">
              <div class="format-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <polyline points="9 14 12 11 15 14"/>
                  <line x1="12" y1="11" x2="12" y2="17"/>
                </svg>
              </div>
              <span class="format-label">Open</span>
            </button>
          }
```

- [ ] **Step 3: Add the `openExisting()` method**

In the `AddCollectionDialogComponent` class, add this method next to `createNew()` (it mirrors the `createNew()` local-save pattern but uses an open dialog filtered to Nikode collections):

```ts
  async openExisting(): Promise<void> {
    const result = await this.api.showOpenDialog({
      title: 'Open Collection',
      properties: ['openFile'],
      filters: [
        { name: 'Nikode Collections', extensions: ['nikode.json'] }
      ]
    });

    if (isIpcError(result) || result.data.canceled || result.data.filePaths.length === 0) {
      return;
    }

    this.dialogRef.close({
      action: 'open',
      storageType: 'local',
      sourcePath: result.data.filePaths[0]
    });
  }
```

`isIpcError` and `ApiService` are already imported in this file; no new imports needed.

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/sidebar/dialogs/open-collection.dialog.ts
git commit -m "Add Open tile to Add Collection dialog"
```

---

### Task 2: Handle the `'open'` action in the sidebar

**Files:**
- Modify: `src/app/features/sidebar/sidebar.component.ts:327-348` (the `addCollection()` action branches)

- [ ] **Step 1: Add the `'open'` branch**

In `addCollection()`, the branches currently read:

```ts
    if (result.action === 'new') {
      // ... existing new-collection handling ...
    } else if (result.action === 'import') {
      // Handle import based on format
      await this.handleImport(result);
    }
```

Add an `'open'` branch after the `'import'` branch:

```ts
    } else if (result.action === 'open') {
      if (result.sourcePath) {
        await this.collectionService.openCollection(result.sourcePath);
      }
    }
```

`collectionService.openCollection(path: string): Promise<boolean>` already exists and handles the "already open" case.

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/sidebar/sidebar.component.ts
git commit -m "Open existing Nikode collection from Add Collection dialog"
```

---

### Task 3: Manual verification

**Files:** none (manual test of the running app)

- [ ] **Step 1: Launch the app**

Use the project's run command (e.g. `npm start` / the Electron dev command). Open the sidebar.

- [ ] **Step 2: Verify the Open tile in Local mode**

Click the "+" (Add Collection) button. With the **Local** toggle active, confirm the **Open** tile appears in the format grid.

- [ ] **Step 3: Verify the Open tile is hidden in Cloud mode**

Switch the toggle to **Cloud** (sign in first if required). Confirm the **Open** tile is no longer shown.

- [ ] **Step 4: Open an existing collection**

Back in **Local** mode, click **Open**, select an existing `.nikode.json` file. Confirm the collection appears in the sidebar tree and its requests are browsable.

- [ ] **Step 5: Verify cancel behavior**

Click **Open** again and cancel the file picker. Confirm the dialog stays open (does not close or error).

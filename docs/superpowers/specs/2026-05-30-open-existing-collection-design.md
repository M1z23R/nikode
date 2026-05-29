# Design: Open existing Nikode collection

## Problem

The "Add Collection" dialog (`src/app/features/sidebar/dialogs/open-collection.dialog.ts`)
offers four tiles: **New · OpenAPI · Postman · Bruno**. There is no explicit way to
open an existing native `.nikode.json` collection.

Opening one is currently only possible through a hidden path: pick **OpenAPI** or
**Postman**, then select a `.nikode.json` file in the picker, where
`sidebar.component.ts` auto-detects the extension and calls `openCollection`
(`sidebar.component.ts:386-390`). This is undiscoverable, and the **Bruno** tile
(folder picker) can't reach a file at all.

## Goal

Give users a discoverable, explicit way to open an existing `.nikode.json`
collection from the Add Collection dialog.

## Scope

Local files only. Cloud collections are reached via the workspace list, not by
opening a file. The Open tile does not appear when the Cloud storage toggle is active.

**Out of scope:**
- Cloud "open" / uploading an opened file to a workspace.
- The latent import-to-cloud `workspaceId` gap: `selectFormat()` returns no
  `workspaceId`, so the `isCloud && workspaceId` branch at `sidebar.component.ts:402`
  is never true and cloud imports of OpenAPI/Postman/Bruno fall back to a local save
  dialog. Documented here but not fixed in this change.

## Changes

### 1. Dialog — `open-collection.dialog.ts`

- Add a fifth tile **"Open"** to the format grid, rendered only when
  `storageType() === 'local'` (wrap the tile in `@if (storageType() === 'local')`).
- Extend the result action union to `'new' | 'import' | 'open'`. The `sourcePath`
  field already exists on `AddCollectionDialogResult`.
- Add an `openExisting()` method that performs the file pick inside the dialog,
  mirroring the existing `createNew()` pattern:
  - `api.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Nikode Collections', extensions: ['nikode.json'] }] })`
  - On cancel / IPC error → return (dialog stays open).
  - On success → `dialogRef.close({ action: 'open', storageType: 'local', sourcePath: filePath })`.

### 2. Sidebar — `sidebar.component.ts`

- In `addCollection()`, add `else if (result.action === 'open')` →
  `await this.collectionService.openCollection(result.sourcePath!)`.

### 3. Auto-detect hack

Left untouched (`sidebar.component.ts:386-390`). It stays as a safety net for users
who pick OpenAPI/Postman but select a `.nikode.json` file.

## Testing

Manual, via the running app:
- Open the Add Collection dialog. With **Local** selected, the **Open** tile is visible.
- Switch to **Cloud**: the Open tile is hidden.
- Click **Open** (Local) → pick a `.nikode.json` file → the collection appears in the tree.
- Cancel the file picker → dialog stays open.

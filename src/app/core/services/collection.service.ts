import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { DialogService, ToastService } from '@m1z23r/ngx-ui';
import { isIpcError, CollectionChangedEvent } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { Collection, CollectionItem, OpenCollection } from '../models/collection.model';
import { OpenCollectionDialogComponent, OpenCollectionDialogResult } from '../../features/sidebar/dialogs/open-collection.dialog';

@Injectable({ providedIn: 'root' })
export class CollectionService implements OnDestroy {
  private api = inject(ApiService);
  private toastService = inject(ToastService);
  private dialogService = inject(DialogService);

  private openCollections = signal<OpenCollection[]>([]);

  readonly collections = this.openCollections.asReadonly();

  // Bound callback for collection changes (needed for proper removal)
  private collectionChangedCallback = this.handleExternalChange.bind(this);

  constructor() {
    // Subscribe to collection-changed events from the file watcher
    this.api.onCollectionChanged(this.collectionChangedCallback);
  }

  ngOnDestroy(): void {
    // Clean up event listener
    this.api.removeCollectionChangedListener(this.collectionChangedCallback);
  }

  async openRecentCollections(): Promise<void> {
    const result = await this.api.getRecent();
    if (isIpcError(result)) {
      console.error('Failed to load recent:', result.error.message);
      return;
    }
    // Open all recent collections
    for (const path of result.data.paths) {
      await this.openCollection(path);
    }
  }

  async openCollection(path: string): Promise<boolean> {
    // Check if already open
    if (this.openCollections().some(c => c.path === path)) {
      return true;
    }

    const result = await this.api.openCollection(path);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.openCollections.update(cols => [
      ...cols,
      {
        path: result.data.path,
        collection: result.data.collection,
        expanded: true,
        dirty: false
      }
    ]);

    // Start file watcher for this collection
    await this.api.watchCollection(path);

    return true;
  }

  async createCollection(path: string, name: string): Promise<boolean> {
    const result = await this.api.createCollection(path, name);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.openCollections.update(cols => [
      ...cols,
      {
        path: result.data.path,
        collection: result.data.collection,
        expanded: true,
        dirty: false
      }
    ]);

    // Start file watcher for this collection
    await this.api.watchCollection(path);

    return true;
  }

  async closeCollection(path: string): Promise<void> {
    // Stop file watcher for this collection
    await this.api.unwatchCollection(path);

    // Remove from recent so it won't reopen on next app launch
    await this.api.removeRecent(path);

    this.openCollections.update(cols => cols.filter(c => c.path !== path));
  }

  toggleExpanded(path: string): void {
    this.openCollections.update(cols =>
      cols.map(c => c.path === path ? { ...c, expanded: !c.expanded } : c)
    );
  }

  setExpanded(path: string, expanded: boolean): void {
    this.openCollections.update(cols =>
      cols.map(c => c.path === path ? { ...c, expanded } : c)
    );
  }

  getCollection(path: string): OpenCollection | undefined {
    return this.openCollections().find(c => c.path === path);
  }

  updateCollection(path: string, collection: Collection): void {
    this.openCollections.update(cols =>
      cols.map(c => c.path === path ? { ...c, collection, dirty: true } : c)
    );
  }

  async saveCollection(path: string): Promise<boolean> {
    const col = this.getCollection(path);
    if (!col) return false;

    const result = await this.api.saveCollection(path, col.collection);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.openCollections.update(cols =>
      cols.map(c => c.path === path ? { ...c, dirty: false } : c)
    );
    return true;
  }

  addItem(collectionPath: string, parentId: string | null, item: CollectionItem): void {
    const col = this.getCollection(collectionPath);
    if (!col) return;

    const updatedCollection = { ...col.collection };

    if (parentId === null) {
      updatedCollection.items = [...updatedCollection.items, item];
    } else {
      updatedCollection.items = this.addItemToParent(updatedCollection.items, parentId, item);
    }

    this.updateCollection(collectionPath, updatedCollection);
  }

  private addItemToParent(items: CollectionItem[], parentId: string, newItem: CollectionItem): CollectionItem[] {
    return items.map(item => {
      if (item.id === parentId && item.type === 'folder') {
        return {
          ...item,
          items: [...(item.items || []), newItem]
        };
      }
      if (item.items) {
        return {
          ...item,
          items: this.addItemToParent(item.items, parentId, newItem)
        };
      }
      return item;
    });
  }

  updateItem(collectionPath: string, itemId: string, updates: Partial<CollectionItem>): void {
    const col = this.getCollection(collectionPath);
    if (!col) return;

    const updatedCollection = {
      ...col.collection,
      items: this.updateItemInTree(col.collection.items, itemId, updates)
    };

    this.updateCollection(collectionPath, updatedCollection);
  }

  private updateItemInTree(items: CollectionItem[], itemId: string, updates: Partial<CollectionItem>): CollectionItem[] {
    return items.map(item => {
      if (item.id === itemId) {
        return { ...item, ...updates };
      }
      if (item.items) {
        return {
          ...item,
          items: this.updateItemInTree(item.items, itemId, updates)
        };
      }
      return item;
    });
  }

  deleteItem(collectionPath: string, itemId: string): void {
    const col = this.getCollection(collectionPath);
    if (!col) return;

    const updatedCollection = {
      ...col.collection,
      items: this.deleteItemFromTree(col.collection.items, itemId)
    };

    this.updateCollection(collectionPath, updatedCollection);
  }

  private deleteItemFromTree(items: CollectionItem[], itemId: string): CollectionItem[] {
    return items
      .filter(item => item.id !== itemId)
      .map(item => {
        if (item.items) {
          return {
            ...item,
            items: this.deleteItemFromTree(item.items, itemId)
          };
        }
        return item;
      });
  }

  findItem(collectionPath: string, itemId: string): CollectionItem | undefined {
    const col = this.getCollection(collectionPath);
    if (!col) return undefined;

    return this.findItemInTree(col.collection.items, itemId);
  }

  private findItemInTree(items: CollectionItem[], itemId: string): CollectionItem | undefined {
    for (const item of items) {
      if (item.id === itemId) {
        return item;
      }
      if (item.items) {
        const found = this.findItemInTree(item.items, itemId);
        if (found) return found;
      }
    }
    return undefined;
  }

  // Unified open/import method

  /**
   * Shows the unified Open Collection dialog and handles the selected mode.
   * For "Open Folder": shows directory picker and opens the collection.
   * For "Import File": shows file picker, detects format, and imports appropriately.
   */
  async openWithDialog(): Promise<boolean> {
    // Step 1: Show unified dialog to select mode
    const ref = this.dialogService.open<OpenCollectionDialogComponent, void, OpenCollectionDialogResult | undefined>(
      OpenCollectionDialogComponent
    );
    const result = await ref.afterClosed();

    if (!result) {
      return false; // User cancelled
    }

    if (result.mode === 'folder') {
      // Open Folder mode: show directory picker
      const dirResult = await this.api.showOpenDialog({
        title: 'Select Collection Folder',
        properties: ['openDirectory']
      });

      if (isIpcError(dirResult) || dirResult.data.canceled || dirResult.data.filePaths.length === 0) {
        return false;
      }

      return this.openCollection(dirResult.data.filePaths[0]);
    } else {
      // Import File mode: show file picker, detect format, import
      const fileResult = await this.api.showOpenDialog({
        title: 'Select File to Import',
        properties: ['openFile'],
        filters: [
          { name: 'Collection Files', extensions: ['json', 'yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (isIpcError(fileResult) || fileResult.data.canceled || fileResult.data.filePaths.length === 0) {
        return false;
      }

      const sourcePath = fileResult.data.filePaths[0];
      return this.detectAndImport(sourcePath);
    }
  }

  /**
   * Detects the format of a file and imports it appropriately.
   * Shows destination picker and routes to the correct import method.
   */
  async detectAndImport(sourcePath: string): Promise<boolean> {
    // Detect file format
    const formatResult = await this.api.detectFileFormat(sourcePath);

    if (isIpcError(formatResult)) {
      this.toastService.error('Failed to read file');
      return false;
    }

    const format = formatResult.data;

    if (format === 'unknown') {
      this.toastService.error('Unrecognized file format. Expected Nikode collection or OpenAPI spec.');
      return false;
    }

    // Show destination picker
    const targetResult = await this.api.showOpenDialog({
      title: 'Select Destination Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (isIpcError(targetResult) || targetResult.data.canceled || targetResult.data.filePaths.length === 0) {
      return false;
    }

    const targetPath = targetResult.data.filePaths[0];

    // Route to appropriate import method
    if (format === 'openapi') {
      return this.importOpenApi(sourcePath, targetPath);
    } else {
      return this.importCollection(sourcePath, targetPath);
    }
  }

  // Export/import methods

  /**
   * Opens native dialogs to import a collection file.
   * Shows file picker for source, then directory picker for destination.
   * Returns true if import was successful.
   */
  async importCollectionWithDialog(): Promise<boolean> {
    // Step 1: Select source file
    const sourceResult = await this.api.showOpenDialog({
      title: 'Select Collection File to Import',
      properties: ['openFile'],
      filters: [
        { name: 'Collection Files', extensions: ['json', 'yaml', 'yml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (isIpcError(sourceResult) || sourceResult.data.canceled || sourceResult.data.filePaths.length === 0) {
      return false; // User cancelled or error
    }

    const sourcePath = sourceResult.data.filePaths[0];

    // Step 2: Select target directory
    const targetResult = await this.api.showOpenDialog({
      title: 'Select Destination Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (isIpcError(targetResult) || targetResult.data.canceled || targetResult.data.filePaths.length === 0) {
      return false; // User cancelled or error
    }

    const targetPath = targetResult.data.filePaths[0];

    // Step 3: Import the collection
    return this.importCollection(sourcePath, targetPath);
  }

  async exportCollection(path: string, format: 'json' | 'yaml'): Promise<boolean> {
    const result = await this.api.exportCollection(path, format);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    if (result.data.filePath) {
      this.toastService.success('Collection exported successfully');
      return true;
    }
    return false; // User cancelled
  }

  async importCollection(sourcePath: string, targetPath: string): Promise<boolean> {
    const result = await this.api.importCollection(sourcePath, targetPath);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.openCollections.update(cols => [
      ...cols,
      {
        path: result.data.path,
        collection: result.data.collection,
        expanded: true,
        dirty: false
      }
    ]);

    // Start file watcher for this collection
    await this.api.watchCollection(targetPath);

    this.toastService.success('Collection imported successfully');
    return true;
  }

  /**
   * Opens native dialogs to import an OpenAPI/Swagger spec.
   * Shows file picker for source, then directory picker for destination.
   * Returns true if import was successful.
   */
  async importOpenApiWithDialog(): Promise<boolean> {
    // Step 1: Select source file
    const sourceResult = await this.api.showOpenDialog({
      title: 'Select OpenAPI/Swagger File',
      properties: ['openFile'],
      filters: [
        { name: 'OpenAPI/Swagger Files', extensions: ['json', 'yaml', 'yml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (isIpcError(sourceResult) || sourceResult.data.canceled || sourceResult.data.filePaths.length === 0) {
      return false;
    }

    const sourcePath = sourceResult.data.filePaths[0];

    // Step 2: Select target directory
    const targetResult = await this.api.showOpenDialog({
      title: 'Select Destination Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (isIpcError(targetResult) || targetResult.data.canceled || targetResult.data.filePaths.length === 0) {
      return false;
    }

    const targetPath = targetResult.data.filePaths[0];

    // Step 3: Import the OpenAPI spec
    return this.importOpenApi(sourcePath, targetPath);
  }

  async importOpenApi(sourcePath: string, targetPath: string): Promise<boolean> {
    const result = await this.api.importOpenApi(sourcePath, targetPath);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.openCollections.update(cols => [
      ...cols,
      {
        path: result.data.path,
        collection: result.data.collection,
        expanded: true,
        dirty: false
      }
    ]);

    // Start file watcher for this collection
    await this.api.watchCollection(targetPath);

    this.toastService.success('OpenAPI spec imported successfully');
    return true;
  }

  async exportOpenApi(path: string): Promise<boolean> {
    const result = await this.api.exportOpenApi(path);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    if (result.data.filePath) {
      this.toastService.success('Exported as OpenAPI successfully');
      return true;
    }
    return false; // User cancelled
  }

  async checkCollectionExists(path: string): Promise<boolean> {
    const result = await this.api.collectionExists(path);
    if (isIpcError(result)) {
      return false;
    }
    return result.data;
  }

  // Handle external file changes
  private async handleExternalChange(event: CollectionChangedEvent): Promise<void> {
    const openCol = this.getCollection(event.path);
    if (!openCol) return;

    if (openCol.dirty) {
      // Collection has unsaved changes - warn the user
      this.toastService.warning(
        `"${openCol.collection.name}" was modified externally. Your unsaved changes may conflict.`
      );
    } else {
      // No local changes - reload the collection
      const result = await this.api.getCollection(event.path);
      if (isIpcError(result)) {
        this.toastService.error(`Failed to reload "${openCol.collection.name}"`);
        return;
      }

      this.openCollections.update(cols =>
        cols.map(c => c.path === event.path
          ? { ...c, collection: result.data, dirty: false }
          : c
        )
      );

      this.toastService.info(`"${result.data.name}" was updated externally and reloaded`);
    }
  }
}

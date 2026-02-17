import { Injectable, inject, computed, signal, effect, untracked } from '@angular/core';
import { ToastService, DialogService } from '@m1z23r/ngx-ui';
import { CollectionService } from './collection.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { AuthService } from './auth.service';
import { NetworkStatusService } from './network-status.service';
import { CollectionMergeService } from './collection-merge.service';
import { CloudSyncStatusService } from './cloud-sync-status.service';
import { UnifiedCollection, CollectionItem, Collection } from '../models/collection.model';
import {
  MergeConflictDialogComponent,
  MergeConflictDialogData,
  MergeConflictDialogResult
} from '../../shared/dialogs/merge-conflict.dialog';

interface OpenCloudCollectionState {
  id: string;
  expanded: boolean;
  dirty: boolean;
  baseSnapshot?: Collection;  // Snapshot when loaded/saved for 3-way merge
}

@Injectable({ providedIn: 'root' })
export class UnifiedCollectionService {
  private collectionService = inject(CollectionService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private authService = inject(AuthService);
  private networkStatusService = inject(NetworkStatusService);
  private toastService = inject(ToastService);
  private dialogService = inject(DialogService);
  private mergeService = inject(CollectionMergeService);
  private cloudSyncStatus = inject(CloudSyncStatusService);

  // Local state for open cloud collections (expanded/dirty state)
  private openCloudCollections = signal<OpenCloudCollectionState[]>([]);

  // Track previous workspace to detect changes
  private previousWorkspaceId: string | null = null;

  // Callbacks for when a collection is refreshed after merge resolution
  private collectionRefreshedCallbacks: ((collectionId: string) => void)[] = [];

  /**
   * Register a callback to be called when a collection is refreshed after merge resolution.
   * Used by WorkspaceService to refresh open requests.
   */
  onCollectionRefreshed(callback: (collectionId: string) => void): void {
    this.collectionRefreshedCallbacks.push(callback);
  }

  private notifyCollectionRefreshed(collectionId: string): void {
    for (const callback of this.collectionRefreshedCallbacks) {
      callback(collectionId);
    }
  }

  constructor() {
    // Clear state on logout
    this.authService.onLogout(() => {
      this.openCloudCollections.set([]);
      this.previousWorkspaceId = null;
    });

    // Clear state on workspace change and capture base snapshots for new collections
    effect(() => {
      const activeWorkspace = this.cloudWorkspaceService.activeWorkspace();
      const cloudCollections = this.cloudWorkspaceService.collections();
      const currentWorkspaceId = activeWorkspace?.id ?? null;

      // Clear state when workspace changes
      if (currentWorkspaceId !== this.previousWorkspaceId) {
        this.openCloudCollections.set([]);
        this.previousWorkspaceId = currentWorkspaceId;
      }

      // Capture base snapshots for any collections that don't have them
      if (activeWorkspace && cloudCollections.length > 0) {
        // Use untracked to avoid effect re-triggering when we update openCloudCollections
        const currentState = untracked(() => this.openCloudCollections());
        const updates: OpenCloudCollectionState[] = [];

        for (const col of cloudCollections) {
          const unifiedId = this.buildCloudId(activeWorkspace.id, col.id);
          const existing = currentState.find(s => s.id === unifiedId);

          if (!existing) {
            updates.push({
              id: unifiedId,
              expanded: false,
              dirty: false,
              baseSnapshot: structuredClone(col.data)
            });
          } else if (!existing.baseSnapshot) {
            updates.push({
              ...existing,
              baseSnapshot: structuredClone(col.data)
            });
          }
        }

        if (updates.length > 0) {
          this.openCloudCollections.update(cols => {
            const result = [...cols];
            for (const update of updates) {
              const idx = result.findIndex(c => c.id === update.id);
              if (idx >= 0) {
                result[idx] = update;
              } else {
                result.push(update);
              }
            }
            return result;
          });
        }
      }
    });
  }

  // Combined collections from local and cloud
  readonly collections = computed<UnifiedCollection[]>(() => {
    const localCollections = this.collectionService.collections();
    const isOnline = this.networkStatusService.isOnline();
    const activeWorkspace = this.cloudWorkspaceService.activeWorkspace();
    const cloudCollections = activeWorkspace ? this.cloudWorkspaceService.collections() : [];
    const openCloudState = this.openCloudCollections();

    // Convert local collections to unified format
    const localUnified: UnifiedCollection[] = localCollections.map(col => ({
      id: col.path,
      source: 'local' as const,
      name: col.collection.name,
      collection: col.collection,
      expanded: col.expanded,
      dirty: col.dirty,
      path: col.path
    }));

    // Convert cloud collections to unified format
    const cloudUnified: UnifiedCollection[] = cloudCollections.map(col => {
      const unifiedId = this.buildCloudId(activeWorkspace!.id, col.id);
      const state = openCloudState.find(s => s.id === unifiedId);

      return {
        id: unifiedId,
        source: 'cloud' as const,
        name: col.name,
        collection: col.data,
        expanded: state?.expanded ?? false,
        dirty: state?.dirty ?? false,
        cloudId: col.id,
        workspaceId: activeWorkspace!.id,
        version: col.version,
        isReadOnly: !isOnline
      };
    });

    // Mix local and cloud collections - local first, then cloud
    return [...localUnified, ...cloudUnified];
  });

  // Helper to identify cloud collection IDs
  buildCloudId(workspaceId: string, collectionId: string): string {
    return `cloud:${workspaceId}:${collectionId}`;
  }

  parseCloudId(id: string): { workspaceId: string; collectionId: string } | null {
    if (!id.startsWith('cloud:')) return null;
    const parts = id.split(':');
    if (parts.length !== 3) return null;
    return { workspaceId: parts[1], collectionId: parts[2] };
  }

  isCloudId(id: string): boolean {
    return id.startsWith('cloud:');
  }

  private getBaseSnapshot(collectionId: string): Collection | undefined {
    return this.openCloudCollections().find(c => c.id === collectionId)?.baseSnapshot;
  }

  getCollection(id: string): UnifiedCollection | undefined {
    return this.collections().find(c => c.id === id);
  }

  // Update collection data (works for both local and cloud)
  updateCollection(id: string, collection: Collection): void {
    if (this.isCloudId(id)) {
      this.updateCloudCollectionLocally(id, collection);
    } else {
      this.collectionService.updateCollection(id, collection);
    }
  }

  toggleExpanded(id: string): void {
    if (this.isCloudId(id)) {
      this.openCloudCollections.update(cols => {
        const existing = cols.find(c => c.id === id);
        if (existing) {
          return cols.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c);
        } else {
          return [...cols, { id, expanded: true, dirty: false }];
        }
      });
    } else {
      this.collectionService.toggleExpanded(id);
    }
  }

  setExpanded(id: string, expanded: boolean): void {
    if (this.isCloudId(id)) {
      this.openCloudCollections.update(cols => {
        const existing = cols.find(c => c.id === id);
        if (existing) {
          return cols.map(c => c.id === id ? { ...c, expanded } : c);
        } else {
          return [...cols, { id, expanded, dirty: false }];
        }
      });
    } else {
      this.collectionService.setExpanded(id, expanded);
    }
  }

  // Add item to collection (folder or request)
  addItem(collectionId: string, parentId: string | null, item: CollectionItem): void {
    if (this.isCloudId(collectionId)) {
      const unified = this.getCollection(collectionId);
      if (!unified || unified.isReadOnly) {
        if (unified?.isReadOnly) {
          this.toastService.error('Cannot modify collection while offline');
        }
        return;
      }

      const updatedCollection = { ...unified.collection };
      if (parentId === null) {
        updatedCollection.items = [...updatedCollection.items, item];
      } else {
        updatedCollection.items = this.addItemToParent(updatedCollection.items, parentId, item);
      }

      this.updateCloudCollectionLocally(collectionId, updatedCollection);
    } else {
      this.collectionService.addItem(collectionId, parentId, item);
    }
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

  // Update item in collection
  updateItem(collectionId: string, itemId: string, updates: Partial<CollectionItem>): void {
    if (this.isCloudId(collectionId)) {
      const unified = this.getCollection(collectionId);
      if (!unified || unified.isReadOnly) {
        if (unified?.isReadOnly) {
          this.toastService.error('Cannot modify collection while offline');
        }
        return;
      }

      const updatedCollection = {
        ...unified.collection,
        items: this.updateItemInTree(unified.collection.items, itemId, updates)
      };

      this.updateCloudCollectionLocally(collectionId, updatedCollection);
    } else {
      this.collectionService.updateItem(collectionId, itemId, updates);
    }
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

  // Delete item from collection
  deleteItem(collectionId: string, itemId: string): void {
    if (this.isCloudId(collectionId)) {
      const unified = this.getCollection(collectionId);
      if (!unified || unified.isReadOnly) {
        if (unified?.isReadOnly) {
          this.toastService.error('Cannot modify collection while offline');
        }
        return;
      }

      const updatedCollection = {
        ...unified.collection,
        items: this.deleteItemFromTree(unified.collection.items, itemId)
      };

      this.updateCloudCollectionLocally(collectionId, updatedCollection);
    } else {
      this.collectionService.deleteItem(collectionId, itemId);
    }
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

  // Find item in collection
  findItem(collectionId: string, itemId: string): CollectionItem | undefined {
    if (this.isCloudId(collectionId)) {
      const unified = this.getCollection(collectionId);
      if (!unified) return undefined;
      return this.findItemInTree(unified.collection.items, itemId);
    } else {
      return this.collectionService.findItem(collectionId, itemId);
    }
  }

  private findItemInTree(items: CollectionItem[], itemId: string): CollectionItem | undefined {
    for (const item of items) {
      if (item.id === itemId) return item;
      if (item.items) {
        const found = this.findItemInTree(item.items, itemId);
        if (found) return found;
      }
    }
    return undefined;
  }

  // Update cloud collection locally (marks dirty, updates local state)
  private updateCloudCollectionLocally(collectionId: string, collection: Collection): void {
    const parsed = this.parseCloudId(collectionId);
    if (!parsed) return;

    // Update the cloud collections signal with new data
    this.cloudWorkspaceService.collections.update(cols =>
      cols.map(c =>
        c.id === parsed.collectionId
          ? { ...c, data: collection }
          : c
      )
    );

    // Mark as dirty in local state
    this.openCloudCollections.update(cols => {
      const existing = cols.find(c => c.id === collectionId);
      if (existing) {
        return cols.map(c => c.id === collectionId ? { ...c, dirty: true } : c);
      } else {
        return [...cols, { id: collectionId, expanded: true, dirty: true }];
      }
    });
  }

  // Save collection (local or cloud)
  async save(collectionId: string): Promise<boolean> {
    if (this.isCloudId(collectionId)) {
      return this.saveCloudCollection(collectionId);
    } else {
      return this.collectionService.saveCollection(collectionId);
    }
  }

  private async saveCloudCollection(collectionId: string): Promise<boolean> {
    const unified = this.getCollection(collectionId);
    if (!unified) return false;

    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot save while offline');
      return false;
    }

    const parsed = this.parseCloudId(collectionId);
    if (!parsed) return false;

    this.cloudSyncStatus.syncing('Saving...');

    try {
      const savedCollection = await this.cloudWorkspaceService.updateCollection(
        parsed.workspaceId,
        parsed.collectionId,
        unified.collection,
        unified.version ?? 1
      );

      // Update base snapshot after successful save and clear dirty flag
      this.openCloudCollections.update(cols =>
        cols.map(c => c.id === collectionId
          ? { ...c, dirty: false, baseSnapshot: structuredClone(savedCollection.data) }
          : c
        )
      );

      this.cloudSyncStatus.success('Saved');
      return true;
    } catch (err: any) {
      if (err?.status === 409) {
        return this.handleSaveConflict(collectionId, parsed.workspaceId, parsed.collectionId);
      } else {
        this.cloudSyncStatus.error('Save failed');
        this.toastService.error(err?.message ?? 'Failed to save collection');
      }
      return false;
    }
  }

  private async handleSaveConflict(
    collectionId: string,
    workspaceId: string,
    cloudCollectionId: string
  ): Promise<boolean> {
    const unified = this.getCollection(collectionId);
    if (!unified) return false;

    const baseSnapshot = this.getBaseSnapshot(collectionId);
    if (!baseSnapshot) {
      this.cloudSyncStatus.error('Conflict resolution failed');
      this.toastService.error('Cannot resolve conflict: base snapshot unavailable. Please refresh and try again.');
      return false;
    }

    this.cloudSyncStatus.syncing('Resolving conflict...');

    // Fetch latest remote version
    try {
      await this.cloudWorkspaceService.loadCollections(workspaceId);
    } catch (err: any) {
      this.cloudSyncStatus.error('Sync failed');
      this.toastService.error('Failed to fetch latest version for conflict resolution');
      return false;
    }

    const remoteCollection = this.cloudWorkspaceService.collections()
      .find(c => c.id === cloudCollectionId);

    if (!remoteCollection) {
      this.cloudSyncStatus.error('Collection deleted');
      this.toastService.error('Collection no longer exists on server');
      return false;
    }

    const local = unified.collection;
    const remote = remoteCollection.data;

    // Perform 3-way merge
    const mergeResult = this.mergeService.threeWayMerge(baseSnapshot, local, remote);

    if (mergeResult.conflicts.length === 0) {
      // No conflicts - auto-save merged result
      try {
        const savedCollection = await this.cloudWorkspaceService.updateCollection(
          workspaceId,
          cloudCollectionId,
          mergeResult.merged,
          remoteCollection.version
        );

        // Update local state with merged result
        this.cloudWorkspaceService.collections.update(cols =>
          cols.map(c => c.id === cloudCollectionId ? savedCollection : c)
        );

        this.openCloudCollections.update(cols =>
          cols.map(c => c.id === collectionId
            ? { ...c, collection: savedCollection.data, dirty: false, baseSnapshot: structuredClone(savedCollection.data) }
            : c
          )
        );

        this.cloudSyncStatus.success(`Merged ${mergeResult.autoMergedCount} changes`);
        this.notifyCollectionRefreshed(collectionId);
        return true;
      } catch (err: any) {
        if (err?.status === 409) {
          // Another conflict occurred during merge save - retry
          return this.handleSaveConflict(collectionId, workspaceId, cloudCollectionId);
        }
        this.cloudSyncStatus.error('Merge failed');
        this.toastService.error(err?.message ?? 'Failed to save merged changes');
        return false;
      }
    }

    // Show conflict resolution dialog
    this.cloudSyncStatus.idle();
    const dialogRef = this.dialogService.open<
      MergeConflictDialogComponent,
      MergeConflictDialogData,
      MergeConflictDialogResult | undefined
    >(MergeConflictDialogComponent, {
      data: { result: mergeResult }
    });

    const result = await dialogRef.afterClosed();

    if (!result || result.cancelled) {
      this.cloudSyncStatus.idle();
      return false;
    }

    // Apply resolutions and save
    this.cloudSyncStatus.syncing('Saving resolved changes...');
    const finalCollection = this.mergeService.applyResolutions(mergeResult, result.resolutions);

    try {
      // Re-fetch to get latest version in case it changed during dialog
      await this.cloudWorkspaceService.loadCollections(workspaceId);
      const latestRemote = this.cloudWorkspaceService.collections()
        .find(c => c.id === cloudCollectionId);

      if (!latestRemote) {
        this.cloudSyncStatus.error('Collection deleted');
        this.toastService.error('Collection no longer exists on server');
        return false;
      }

      const savedCollection = await this.cloudWorkspaceService.updateCollection(
        workspaceId,
        cloudCollectionId,
        finalCollection,
        latestRemote.version
      );

      // Update local state with resolved result
      this.cloudWorkspaceService.collections.update(cols =>
        cols.map(c => c.id === cloudCollectionId ? savedCollection : c)
      );

      this.openCloudCollections.update(cols =>
        cols.map(c => c.id === collectionId
          ? { ...c, collection: savedCollection.data, dirty: false, baseSnapshot: structuredClone(savedCollection.data) }
          : c
        )
      );

      this.cloudSyncStatus.success('Conflicts resolved');
      this.notifyCollectionRefreshed(collectionId);
      return true;
    } catch (err: any) {
      if (err?.status === 409) {
        // Version changed during dialog - retry entire process
        return this.handleSaveConflict(collectionId, workspaceId, cloudCollectionId);
      }
      this.cloudSyncStatus.error('Save failed');
      this.toastService.error(err?.message ?? 'Failed to save resolved changes');
      return false;
    }
  }

  // Close collection
  async close(collectionId: string): Promise<void> {
    if (this.isCloudId(collectionId)) {
      // Just remove from open state
      this.openCloudCollections.update(cols => cols.filter(c => c.id !== collectionId));
    } else {
      await this.collectionService.closeCollection(collectionId);
    }
  }

  // Sync cloud collection (refresh from server)
  async syncCloudCollection(collectionId: string): Promise<void> {
    const parsed = this.parseCloudId(collectionId);
    if (!parsed) return;

    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot sync while offline');
      return;
    }

    this.cloudSyncStatus.syncing('Syncing...');
    try {
      await this.cloudWorkspaceService.loadCollections(parsed.workspaceId);
      this.cloudSyncStatus.success('Synced');
    } catch (err: any) {
      this.cloudSyncStatus.error('Sync failed');
      this.toastService.error(err?.message ?? 'Failed to sync collection');
    }
  }

  // Create new cloud collection
  async createCloudCollection(workspaceId: string, name: string): Promise<boolean> {
    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot create collection while offline');
      return false;
    }

    this.cloudSyncStatus.syncing('Creating collection...');
    try {
      const emptyCollection: Collection = {
        name,
        version: '1.0',
        environments: [
          { id: 'default', name: 'Default', variables: [] }
        ],
        activeEnvironmentId: 'default',
        items: []
      };

      const cloudCollection = await this.cloudWorkspaceService.createCollection(
        workspaceId,
        name,
        emptyCollection
      );

      // Expand the new collection
      const newId = this.buildCloudId(workspaceId, cloudCollection.id);
      this.openCloudCollections.update(cols => [
        ...cols,
        { id: newId, expanded: true, dirty: false }
      ]);

      this.cloudSyncStatus.success('Collection created');
      return true;
    } catch (err: any) {
      this.cloudSyncStatus.error('Creation failed');
      this.toastService.error(err?.message ?? 'Failed to create collection');
      return false;
    }
  }
}

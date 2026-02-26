import { Injectable, inject, computed, signal, effect, untracked } from '@angular/core';
import { ToastService, DialogService } from '@m1z23r/ngx-ui';
import { CollectionService } from './collection.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { AuthService } from './auth.service';
import { NetworkStatusService } from './network-status.service';
import { CollectionMergeService } from './collection-merge.service';
import { CloudSyncStatusService } from './cloud-sync-status.service';
import { SettingsService } from './settings.service';
import { UnifiedCollection, CollectionItem, Collection, normalizeCollection } from '../models/collection.model';
import { CloudCollection } from '../models/cloud.model';
import {
  MergeConflictDialogComponent,
  MergeConflictDialogData,
  MergeConflictDialogResult
} from '../../shared/dialogs/merge-conflict.dialog';
import { ConflictResolution, ResolutionChoice } from '../models/merge.model';

export interface DirtyTabUpdate {
  itemId: string;
  updates: Partial<CollectionItem>;
}

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
  private settingsService = inject(SettingsService);

  // Local state for open cloud collections (expanded/dirty state)
  private openCloudCollections = signal<OpenCloudCollectionState[]>([]);

  // Track previous workspace to detect changes
  private previousWorkspaceId: string | null = null;

  // Callbacks for when a collection is refreshed after merge resolution
  private collectionRefreshedCallbacks: ((collectionId: string, force: boolean) => void)[] = [];

  // Callbacks to collect dirty tab updates from tab services (WorkspaceService, WebSocketService, GraphQLService)
  private dirtyTabCallbacks: ((collectionPath: string) => DirtyTabUpdate[])[] = [];

  /**
   * Register a callback to be called when a collection is refreshed after merge resolution.
   * Used by WorkspaceService, WebSocketService, GraphQLService to refresh open tabs.
   */
  onCollectionRefreshed(callback: (collectionId: string, force: boolean) => void): void {
    this.collectionRefreshedCallbacks.push(callback);
  }

  /**
   * Register a callback to collect dirty tab updates for a collection.
   * Used by tab services to report unsaved changes during remote update merge.
   */
  onGetDirtyTabUpdates(callback: (collectionPath: string) => DirtyTabUpdate[]): void {
    this.dirtyTabCallbacks.push(callback);
  }

  private notifyCollectionRefreshed(collectionId: string, force = false): void {
    for (const callback of this.collectionRefreshedCallbacks) {
      callback(collectionId, force);
    }
  }

  private collectDirtyTabUpdates(collectionPath: string): DirtyTabUpdate[] {
    const updates: DirtyTabUpdate[] = [];
    for (const cb of this.dirtyTabCallbacks) {
      updates.push(...cb(collectionPath));
    }
    return updates;
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

  // Move item within a collection (reorder / reparent)
  moveItem(collectionId: string, itemId: string, targetId: string | null, position: 'before' | 'after' | 'inside'): void {
    if (this.isCloudId(collectionId)) {
      const unified = this.getCollection(collectionId);
      if (!unified || unified.isReadOnly) {
        if (unified?.isReadOnly) {
          this.toastService.error('Cannot modify collection while offline');
        }
        return;
      }

      const item = this.findItemInTree(unified.collection.items, itemId);
      if (!item) return;

      // Guard: don't move folder into own descendants
      if (position === 'inside' && item.type === 'folder' && targetId) {
        if (this.isDescendant(item, targetId)) return;
      }

      let items = this.deleteItemFromTree(unified.collection.items, itemId);

      if (targetId === null) {
        items = [...items, item];
      } else {
        items = this.insertItemInTree(items, item, targetId, position);
      }

      this.updateCloudCollectionLocally(collectionId, { ...unified.collection, items });
    } else {
      this.collectionService.moveItem(collectionId, itemId, targetId, position);
    }
  }

  private isDescendant(parent: CollectionItem, targetId: string): boolean {
    if (!parent.items) return false;
    for (const child of parent.items) {
      if (child.id === targetId) return true;
      if (this.isDescendant(child, targetId)) return true;
    }
    return false;
  }

  private insertItemInTree(items: CollectionItem[], item: CollectionItem, targetId: string, position: 'before' | 'after' | 'inside'): CollectionItem[] {
    if (position === 'inside') {
      return items.map(i => {
        if (i.id === targetId && i.type === 'folder') {
          return { ...i, items: [...(i.items || []), item] };
        }
        if (i.items) {
          return { ...i, items: this.insertItemInTree(i.items, item, targetId, position) };
        }
        return i;
      });
    }

    const idx = items.findIndex(i => i.id === targetId);
    if (idx !== -1) {
      const result = [...items];
      const insertIdx = position === 'before' ? idx : idx + 1;
      result.splice(insertIdx, 0, item);
      return result;
    }

    return items.map(i => {
      if (i.items) {
        return { ...i, items: this.insertItemInTree(i.items, item, targetId, position) };
      }
      return i;
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

    // Check merge conflict behavior setting
    const mergeBehavior = this.settingsService.current().mergeConflictBehavior;

    let resolutions: ConflictResolution[];

    if (mergeBehavior === 'keep-local' || mergeBehavior === 'keep-remote') {
      // Auto-resolve all conflicts with the configured behavior
      resolutions = mergeResult.conflicts.map(c => ({
        conflictId: c.id,
        choice: mergeBehavior as ResolutionChoice
      }));
    } else {
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

      resolutions = result.resolutions;
    }

    // Apply resolutions and save
    this.cloudSyncStatus.syncing('Saving resolved changes...');
    const finalCollection = this.mergeService.applyResolutions(mergeResult, resolutions);

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

  // Delete collection (both local and cloud)
  async deleteCollection(collectionId: string): Promise<boolean> {
    if (this.isCloudId(collectionId)) {
      return this.deleteCloudCollection(collectionId);
    } else {
      return this.deleteLocalCollection(collectionId);
    }
  }

  private async deleteCloudCollection(collectionId: string): Promise<boolean> {
    const parsed = this.parseCloudId(collectionId);
    if (!parsed) return false;

    // Check if user is owner of the workspace
    const workspace = this.cloudWorkspaceService.activeWorkspace();
    if (!workspace || workspace.role !== 'owner') {
      this.toastService.error('Only workspace owners can delete collections');
      return false;
    }

    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot delete collection while offline');
      return false;
    }

    this.cloudSyncStatus.syncing('Deleting...');
    try {
      await this.cloudWorkspaceService.deleteCollection(parsed.workspaceId, parsed.collectionId);
      this.openCloudCollections.update(cols => cols.filter(c => c.id !== collectionId));
      this.cloudSyncStatus.success('Collection deleted');
      return true;
    } catch (err: any) {
      this.cloudSyncStatus.error('Delete failed');
      this.toastService.error(err?.message ?? 'Failed to delete collection');
      return false;
    }
  }

  private async deleteLocalCollection(collectionId: string): Promise<boolean> {
    try {
      await this.collectionService.deleteCollection(collectionId);
      return true;
    } catch (err: any) {
      this.toastService.error(err?.message ?? 'Failed to delete collection');
      return false;
    }
  }

  // Clone/duplicate an item (folder or request)
  cloneItem(collectionId: string, itemId: string): void {
    const unified = this.getCollection(collectionId);
    if (!unified) return;

    if (unified.isReadOnly) {
      this.toastService.error('Cannot modify collection while offline');
      return;
    }

    const item = this.findItemInTree(unified.collection.items, itemId);
    if (!item) return;

    // Deep clone and regenerate IDs
    const clonedItem = this.regenerateIds(structuredClone(item));
    clonedItem.name = `${item.name} (Copy)`;

    // Find parent and insert after the original
    const parentId = this.findParentId(unified.collection.items, itemId);

    if (this.isCloudId(collectionId)) {
      const updatedCollection = { ...unified.collection };
      updatedCollection.items = this.insertItemAfter(updatedCollection.items, itemId, clonedItem);
      this.updateCloudCollectionLocally(collectionId, updatedCollection);
    } else {
      this.collectionService.cloneItem(collectionId, itemId, clonedItem);
    }
  }

  private regenerateIds(item: CollectionItem): CollectionItem {
    const typePrefix = item.type === 'folder' ? 'folder' :
                       item.type === 'websocket' ? 'ws' :
                       item.type === 'graphql' ? 'gql' : 'req';
    item.id = `${typePrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (item.items) {
      item.items = item.items.map(child => this.regenerateIds(child));
    }
    return item;
  }

  private findParentId(items: CollectionItem[], targetId: string, parentId: string | null = null): string | null {
    for (const item of items) {
      if (item.id === targetId) return parentId;
      if (item.items) {
        const found = this.findParentId(item.items, targetId, item.id);
        if (found !== undefined) return found;
      }
    }
    return null;
  }

  private insertItemAfter(items: CollectionItem[], afterId: string, newItem: CollectionItem): CollectionItem[] {
    const result: CollectionItem[] = [];
    for (const item of items) {
      result.push(item);
      if (item.id === afterId) {
        result.push(newItem);
      } else if (item.items) {
        const updatedItem = { ...item, items: this.insertItemAfter(item.items, afterId, newItem) };
        result[result.length - 1] = updatedItem;
      }
    }
    return result;
  }

  // Check if user can delete cloud collection (must be owner)
  canDeleteCloudCollection(): boolean {
    const workspace = this.cloudWorkspaceService.activeWorkspace();
    return workspace?.role === 'owner';
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

  /**
   * Handle a remote collection update from WebSocket.
   * Performs 3-way merge if local edits exist, otherwise accepts remote directly.
   */
  async handleRemoteCollectionUpdate(workspaceId: string, collectionId: string): Promise<void> {
    // Fetch latest collection from server
    const remoteCollection = await this.cloudWorkspaceService.getCollectionById(workspaceId, collectionId);

    if (!remoteCollection) {
      // Collection might have been deleted or error fetching - do full reload
      await this.cloudWorkspaceService.loadCollections(workspaceId);
      return;
    }

    const unifiedId = this.buildCloudId(workspaceId, collectionId);
    const localState = this.openCloudCollections().find(s => s.id === unifiedId);
    const isCollectionDirty = localState?.dirty ?? false;

    // Collect dirty tab updates (unsaved tab edits not yet written to collection)
    const dirtyTabUpdates = this.collectDirtyTabUpdates(unifiedId);
    const hasDirtyTabs = dirtyTabUpdates.length > 0;

    if (!isCollectionDirty && !hasDirtyTabs) {
      // No local edits anywhere - accept remote directly
      this.applyRemoteUpdate(unifiedId, collectionId, remoteCollection);
      return;
    }

    // Has local edits - perform 3-way merge
    const baseSnapshot = localState?.baseSnapshot;
    if (!baseSnapshot) {
      // No base snapshot available - accept remote with warning
      this.toastService.warning('Remote changes received. Local edits may be lost due to missing base snapshot.');
      this.applyRemoteUpdate(unifiedId, collectionId, remoteCollection);
      return;
    }

    // Get current local collection data
    const localCollection = this.cloudWorkspaceService.collections()
      .find(c => c.id === collectionId);
    if (!localCollection) {
      this.applyRemoteUpdate(unifiedId, collectionId, remoteCollection);
      return;
    }

    // Build "virtual local" by applying dirty tab updates to current collection data
    let local = localCollection.data;
    if (hasDirtyTabs) {
      local = structuredClone(local);
      for (const tabUpdate of dirtyTabUpdates) {
        local = {
          ...local,
          items: this.updateItemInTree(local.items, tabUpdate.itemId, tabUpdate.updates)
        };
      }
    }

    const remote = remoteCollection.data;

    // Perform 3-way merge
    const mergeResult = this.mergeService.threeWayMerge(baseSnapshot, local, remote);

    if (mergeResult.conflicts.length === 0) {
      // No conflicts - apply merged result
      // If dirty tabs existed, keep collection dirty so merged result gets saved on next save/autosave
      this.applyMergedResult(unifiedId, collectionId, mergeResult.merged, remoteCollection.version, {
        keepDirty: hasDirtyTabs,
        baseOverride: remote,
      });
      if (mergeResult.autoMergedCount > 0) {
        this.toastService.info(`Auto-merged ${mergeResult.autoMergedCount} remote changes`);
      }
      return;
    }

    // Has conflicts - check merge behavior setting
    const mergeBehavior = this.settingsService.current().mergeConflictBehavior;

    let resolutions: ConflictResolution[];

    if (mergeBehavior === 'keep-local' || mergeBehavior === 'keep-remote') {
      // Auto-resolve with configured behavior
      resolutions = mergeResult.conflicts.map(c => ({
        conflictId: c.id,
        choice: mergeBehavior as ResolutionChoice
      }));
    } else {
      // Show conflict resolution dialog
      const dialogRef = this.dialogService.open<
        MergeConflictDialogComponent,
        MergeConflictDialogData,
        MergeConflictDialogResult | undefined
      >(MergeConflictDialogComponent, {
        data: { result: mergeResult }
      });

      const result = await dialogRef.afterClosed();

      if (!result || result.cancelled) {
        // User cancelled - keep local dirty state
        // Update base snapshot so next merge uses current remote as base
        this.openCloudCollections.update(cols =>
          cols.map(c => c.id === unifiedId
            ? { ...c, baseSnapshot: structuredClone(remote) }
            : c
          )
        );
        return;
      }

      resolutions = result.resolutions;
    }

    // Apply resolutions
    const finalCollection = this.mergeService.applyResolutions(mergeResult, resolutions);
    this.applyMergedResult(unifiedId, collectionId, finalCollection, remoteCollection.version, {
      keepDirty: hasDirtyTabs,
      baseOverride: remote,
    });
  }

  /**
   * Apply a remote update directly (no merge needed).
   */
  private applyRemoteUpdate(unifiedId: string, collectionId: string, remoteCollection: CloudCollection): void {
    // Update cloud collections signal
    this.cloudWorkspaceService.collections.update(cols => {
      const exists = cols.some(c => c.id === collectionId);
      if (exists) {
        return cols.map(c => c.id === collectionId ? remoteCollection : c);
      } else {
        // New collection created remotely
        return [...cols, remoteCollection];
      }
    });

    // Update base snapshot
    this.openCloudCollections.update(cols => {
      const existing = cols.find(c => c.id === unifiedId);
      if (existing) {
        return cols.map(c => c.id === unifiedId
          ? { ...c, baseSnapshot: structuredClone(remoteCollection.data) }
          : c
        );
      } else {
        return [...cols, {
          id: unifiedId,
          expanded: false,
          dirty: false,
          baseSnapshot: structuredClone(remoteCollection.data)
        }];
      }
    });

    // Notify tabs to refresh
    this.notifyCollectionRefreshed(unifiedId);
  }

  /**
   * Apply a merged result after conflict resolution.
   * When keepDirty is true, the collection stays dirty (tab changes are in the merge
   * but not yet saved to server), baseSnapshot is set to baseOverride (the remote version)
   * so future merges use the correct base, and tabs are force-refreshed.
   */
  private applyMergedResult(
    unifiedId: string,
    collectionId: string,
    collection: Collection,
    version: number,
    options?: { keepDirty?: boolean; baseOverride?: Collection }
  ): void {
    const keepDirty = options?.keepDirty ?? false;

    // Update cloud collections signal with merged data
    this.cloudWorkspaceService.collections.update(cols =>
      cols.map(c => c.id === collectionId
        ? { ...c, data: collection, version }
        : c
      )
    );

    // Update dirty flag and base snapshot
    this.openCloudCollections.update(cols =>
      cols.map(c => c.id === unifiedId
        ? {
            ...c,
            dirty: keepDirty,
            baseSnapshot: keepDirty && options?.baseOverride
              ? structuredClone(options.baseOverride)
              : structuredClone(collection)
          }
        : c
      )
    );

    // Notify tabs to refresh (force when keepDirty so dirty tabs also refresh)
    this.notifyCollectionRefreshed(unifiedId, keepDirty);
  }

  // Create new cloud collection
  async createCloudCollection(workspaceId: string, name: string, templateData?: Collection | null): Promise<boolean> {
    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot create collection while offline');
      return false;
    }

    this.cloudSyncStatus.syncing('Creating collection...');
    try {
      const collection: Collection = normalizeCollection({
        ...(templateData ?? { version: '1.0', environments: [], activeEnvironmentId: '', items: [] }),
        name,
      });

      const cloudCollection = await this.cloudWorkspaceService.createCollection(
        workspaceId,
        name,
        collection
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

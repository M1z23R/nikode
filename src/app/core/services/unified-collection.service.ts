import { Injectable, inject, computed, signal, effect } from '@angular/core';
import { ToastService } from '@m1z23r/ngx-ui';
import { CollectionService } from './collection.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { NetworkStatusService } from './network-status.service';
import { AuthService } from './auth.service';
import { UnifiedCollection, CollectionItem, Collection } from '../models/collection.model';
import { CloudCollection } from '../models/cloud.model';

interface OpenCloudCollectionState {
  id: string;
  expanded: boolean;
  dirty: boolean;
}

@Injectable({ providedIn: 'root' })
export class UnifiedCollectionService {
  private collectionService = inject(CollectionService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private networkStatusService = inject(NetworkStatusService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  // Local state for open cloud collections (expanded/dirty state)
  private openCloudCollections = signal<OpenCloudCollectionState[]>([]);

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

  getCollection(id: string): UnifiedCollection | undefined {
    return this.collections().find(c => c.id === id);
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

    try {
      await this.cloudWorkspaceService.updateCollection(
        parsed.workspaceId,
        parsed.collectionId,
        unified.collection,
        unified.version ?? 1
      );

      // Clear dirty flag
      this.openCloudCollections.update(cols =>
        cols.map(c => c.id === collectionId ? { ...c, dirty: false } : c)
      );

      return true;
    } catch (err: any) {
      if (err?.status === 409) {
        this.toastService.error('Conflict: Collection was modified by another user. Please refresh.');
      } else {
        this.toastService.error(err?.message ?? 'Failed to save collection');
      }
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

    try {
      await this.cloudWorkspaceService.loadCollections(parsed.workspaceId);
      this.toastService.success('Collection synced');
    } catch (err: any) {
      this.toastService.error(err?.message ?? 'Failed to sync collection');
    }
  }

  // Create new cloud collection
  async createCloudCollection(workspaceId: string, name: string): Promise<boolean> {
    if (!this.networkStatusService.isOnline()) {
      this.toastService.error('Cannot create collection while offline');
      return false;
    }

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

      return true;
    } catch (err: any) {
      this.toastService.error(err?.message ?? 'Failed to create collection');
      return false;
    }
  }
}

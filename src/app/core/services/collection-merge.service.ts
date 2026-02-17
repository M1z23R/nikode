import { Injectable } from '@angular/core';
import equal from 'fast-deep-equal';
import { Collection, CollectionItem, Environment } from '../models/collection.model';
import {
  ItemConflict,
  MergeResult,
  ConflictResolution,
  ConflictType,
  ItemType
} from '../models/merge.model';

@Injectable({ providedIn: 'root' })
export class CollectionMergeService {

  collectAllItemIds(items: CollectionItem[]): Set<string> {
    const ids = new Set<string>();
    const collect = (items: CollectionItem[]) => {
      for (const item of items) {
        ids.add(item.id);
        if (item.items) {
          collect(item.items);
        }
      }
    };
    collect(items);
    return ids;
  }

  collectAllEnvIds(environments: Environment[]): Set<string> {
    return new Set(environments.map(e => e.id));
  }

  findItemById(items: CollectionItem[], id: string): CollectionItem | undefined {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.items) {
        const found = this.findItemById(item.items, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  findEnvById(environments: Environment[], id: string): Environment | undefined {
    return environments.find(e => e.id === id);
  }

  getItemPath(items: CollectionItem[], id: string, currentPath: string[] = []): string[] {
    for (const item of items) {
      if (item.id === id) {
        return [...currentPath, item.name];
      }
      if (item.items) {
        const found = this.getItemPath(item.items, id, [...currentPath, item.name]);
        if (found.length > 0) return found;
      }
    }
    return [];
  }

  threeWayMerge(base: Collection, local: Collection, remote: Collection): MergeResult {
    const conflicts: ItemConflict[] = [];
    let autoMergedCount = 0;

    // Start with local as the base for merged result
    let mergedItems = structuredClone(local.items);
    let mergedEnvs = structuredClone(local.environments);

    // Merge items
    const baseItemIds = this.collectAllItemIds(base.items);
    const localItemIds = this.collectAllItemIds(local.items);
    const remoteItemIds = this.collectAllItemIds(remote.items);
    const allItemIds = new Set([...baseItemIds, ...localItemIds, ...remoteItemIds]);

    for (const id of allItemIds) {
      const inBase = baseItemIds.has(id);
      const inLocal = localItemIds.has(id);
      const inRemote = remoteItemIds.has(id);

      const baseItem = inBase ? this.findItemById(base.items, id) : undefined;
      const localItem = inLocal ? this.findItemById(local.items, id) : undefined;
      const remoteItem = inRemote ? this.findItemById(remote.items, id) : undefined;

      // Case 1: NEW in local only (not in base, not in remote)
      if (!inBase && inLocal && !inRemote) {
        // Already in merged (started from local), auto-merge
        autoMergedCount++;
        continue;
      }

      // Case 2: NEW in remote only (not in base, not in local)
      if (!inBase && !inLocal && inRemote) {
        // Add remote item to merged
        mergedItems = this.addItemToMerged(mergedItems, remoteItem!, remote.items);
        autoMergedCount++;
        continue;
      }

      // Case 3: NEW in both (not in base, in both local and remote)
      if (!inBase && inLocal && inRemote) {
        // Both added same UUID - check if identical
        if (equal(localItem, remoteItem)) {
          // Already in merged, no action needed
          autoMergedCount++;
        } else {
          // Both added different items with same UUID - conflict
          conflicts.push({
            id,
            type: 'update',
            itemType: 'item',
            path: this.getItemPath(local.items, id) || this.getItemPath(remote.items, id),
            localVersion: localItem,
            remoteVersion: remoteItem
          });
        }
        continue;
      }

      // Case 4: DELETED locally (in base+remote, not in local)
      if (inBase && !inLocal && inRemote) {
        const remoteUnchanged = equal(baseItem, remoteItem);
        if (remoteUnchanged) {
          // Accept delete - item not in merged (started from local)
          autoMergedCount++;
        } else {
          // Conflict: local deleted, remote modified
          conflicts.push({
            id,
            type: 'delete-local',
            itemType: 'item',
            path: this.getItemPath(base.items, id),
            baseVersion: baseItem,
            remoteVersion: remoteItem
          });
        }
        continue;
      }

      // Case 5: DELETED remotely (in base+local, not in remote)
      if (inBase && inLocal && !inRemote) {
        const localUnchanged = equal(baseItem, localItem);
        if (localUnchanged) {
          // Accept remote delete - remove from merged
          mergedItems = this.removeItemFromTree(mergedItems, id);
          autoMergedCount++;
        } else {
          // Conflict: remote deleted, local modified
          conflicts.push({
            id,
            type: 'delete-remote',
            itemType: 'item',
            path: this.getItemPath(local.items, id),
            baseVersion: baseItem,
            localVersion: localItem
          });
        }
        continue;
      }

      // Case 6: EXISTS in all three
      if (inBase && inLocal && inRemote) {
        const localChanged = !equal(baseItem, localItem);
        const remoteChanged = !equal(baseItem, remoteItem);

        if (!localChanged && !remoteChanged) {
          // No changes, keep as-is
          continue;
        }

        if (!localChanged && remoteChanged) {
          // Take remote change
          mergedItems = this.updateItemInTree(mergedItems, id, remoteItem!);
          autoMergedCount++;
          continue;
        }

        if (localChanged && !remoteChanged) {
          // Keep local change (already in merged)
          autoMergedCount++;
          continue;
        }

        // Both changed
        if (equal(localItem, remoteItem)) {
          // Same change, no conflict
          autoMergedCount++;
          continue;
        }

        // Different changes - conflict
        conflicts.push({
          id,
          type: 'update',
          itemType: 'item',
          path: this.getItemPath(local.items, id),
          baseVersion: baseItem,
          localVersion: localItem,
          remoteVersion: remoteItem
        });
        continue;
      }

      // Case 7: DELETED in both (in base, not in local, not in remote)
      if (inBase && !inLocal && !inRemote) {
        // Both deleted, no action needed
        autoMergedCount++;
        continue;
      }
    }

    // Merge environments (same logic)
    const baseEnvIds = this.collectAllEnvIds(base.environments);
    const localEnvIds = this.collectAllEnvIds(local.environments);
    const remoteEnvIds = this.collectAllEnvIds(remote.environments);
    const allEnvIds = new Set([...baseEnvIds, ...localEnvIds, ...remoteEnvIds]);

    for (const id of allEnvIds) {
      const inBase = baseEnvIds.has(id);
      const inLocal = localEnvIds.has(id);
      const inRemote = remoteEnvIds.has(id);

      const baseEnv = inBase ? this.findEnvById(base.environments, id) : undefined;
      const localEnv = inLocal ? this.findEnvById(local.environments, id) : undefined;
      const remoteEnv = inRemote ? this.findEnvById(remote.environments, id) : undefined;

      // NEW in remote only
      if (!inBase && !inLocal && inRemote) {
        mergedEnvs.push(structuredClone(remoteEnv!));
        autoMergedCount++;
        continue;
      }

      // NEW in local only - already in merged
      if (!inBase && inLocal && !inRemote) {
        autoMergedCount++;
        continue;
      }

      // NEW in both
      if (!inBase && inLocal && inRemote) {
        if (!equal(localEnv, remoteEnv)) {
          conflicts.push({
            id,
            type: 'update',
            itemType: 'environment',
            path: [localEnv?.name || remoteEnv?.name || 'Environment'],
            localVersion: localEnv,
            remoteVersion: remoteEnv
          });
        } else {
          autoMergedCount++;
        }
        continue;
      }

      // DELETED locally
      if (inBase && !inLocal && inRemote) {
        if (!equal(baseEnv, remoteEnv)) {
          conflicts.push({
            id,
            type: 'delete-local',
            itemType: 'environment',
            path: [baseEnv?.name || 'Environment'],
            baseVersion: baseEnv,
            remoteVersion: remoteEnv
          });
        } else {
          autoMergedCount++;
        }
        continue;
      }

      // DELETED remotely
      if (inBase && inLocal && !inRemote) {
        if (!equal(baseEnv, localEnv)) {
          conflicts.push({
            id,
            type: 'delete-remote',
            itemType: 'environment',
            path: [localEnv?.name || 'Environment'],
            baseVersion: baseEnv,
            localVersion: localEnv
          });
        } else {
          mergedEnvs = mergedEnvs.filter(e => e.id !== id);
          autoMergedCount++;
        }
        continue;
      }

      // EXISTS in all three
      if (inBase && inLocal && inRemote) {
        const localChanged = !equal(baseEnv, localEnv);
        const remoteChanged = !equal(baseEnv, remoteEnv);

        if (!localChanged && remoteChanged) {
          mergedEnvs = mergedEnvs.map(e => e.id === id ? structuredClone(remoteEnv!) : e);
          autoMergedCount++;
        } else if (localChanged && remoteChanged && !equal(localEnv, remoteEnv)) {
          conflicts.push({
            id,
            type: 'update',
            itemType: 'environment',
            path: [localEnv?.name || 'Environment'],
            baseVersion: baseEnv,
            localVersion: localEnv,
            remoteVersion: remoteEnv
          });
        } else if (localChanged || remoteChanged) {
          autoMergedCount++;
        }
        continue;
      }

      // DELETED in both
      if (inBase && !inLocal && !inRemote) {
        autoMergedCount++;
      }
    }

    // Merge activeEnvironmentId - prefer local if it exists, else remote
    let activeEnvId = local.activeEnvironmentId;
    if (!mergedEnvs.find(e => e.id === activeEnvId)) {
      activeEnvId = remote.activeEnvironmentId;
      if (!mergedEnvs.find(e => e.id === activeEnvId) && mergedEnvs.length > 0) {
        activeEnvId = mergedEnvs[0].id;
      }
    }

    const merged: Collection = {
      name: local.name,
      version: local.version,
      environments: mergedEnvs,
      activeEnvironmentId: activeEnvId,
      items: mergedItems
    };

    return { merged, conflicts, autoMergedCount };
  }

  applyResolutions(result: MergeResult, resolutions: ConflictResolution[]): Collection {
    let merged = structuredClone(result.merged);

    for (const resolution of resolutions) {
      const conflict = result.conflicts.find(c => c.id === resolution.conflictId);
      if (!conflict) continue;

      if (conflict.itemType === 'item') {
        merged.items = this.applyItemResolution(merged.items, conflict, resolution);
      } else {
        merged.environments = this.applyEnvResolution(merged.environments, conflict, resolution);
      }
    }

    return merged;
  }

  private applyItemResolution(
    items: CollectionItem[],
    conflict: ItemConflict,
    resolution: ConflictResolution
  ): CollectionItem[] {
    const { choice } = resolution;

    switch (conflict.type) {
      case 'update':
        if (choice === 'keep-local') {
          // Already local version in merged, nothing to do
          return items;
        } else if (choice === 'keep-remote') {
          return this.updateItemInTree(items, conflict.id, conflict.remoteVersion as CollectionItem);
        } else if (choice === 'keep-both') {
          // Keep local and add remote with new ID
          const remoteCopy = structuredClone(conflict.remoteVersion as CollectionItem);
          remoteCopy.id = crypto.randomUUID();
          remoteCopy.name = `${remoteCopy.name} (server)`;
          return this.addItemAfter(items, conflict.id, remoteCopy);
        }
        break;

      case 'delete-local':
        if (choice === 'keep-local') {
          // Confirm delete - item should not be in merged
          return this.removeItemFromTree(items, conflict.id);
        } else if (choice === 'keep-remote') {
          // Restore remote version
          const parent = this.findParentPath(conflict.path);
          return this.addItemToPath(items, parent, conflict.remoteVersion as CollectionItem);
        }
        break;

      case 'delete-remote':
        if (choice === 'keep-local') {
          // Keep local - already in merged
          return items;
        } else if (choice === 'keep-remote') {
          // Accept remote delete
          return this.removeItemFromTree(items, conflict.id);
        }
        break;
    }

    return items;
  }

  private applyEnvResolution(
    environments: Environment[],
    conflict: ItemConflict,
    resolution: ConflictResolution
  ): Environment[] {
    const { choice } = resolution;

    switch (conflict.type) {
      case 'update':
        if (choice === 'keep-local') {
          return environments;
        } else if (choice === 'keep-remote') {
          return environments.map(e =>
            e.id === conflict.id ? structuredClone(conflict.remoteVersion as Environment) : e
          );
        } else if (choice === 'keep-both') {
          const remoteCopy = structuredClone(conflict.remoteVersion as Environment);
          remoteCopy.id = crypto.randomUUID();
          remoteCopy.name = `${remoteCopy.name} (server)`;
          return [...environments, remoteCopy];
        }
        break;

      case 'delete-local':
        if (choice === 'keep-local') {
          return environments.filter(e => e.id !== conflict.id);
        } else if (choice === 'keep-remote') {
          return [...environments, structuredClone(conflict.remoteVersion as Environment)];
        }
        break;

      case 'delete-remote':
        if (choice === 'keep-local') {
          return environments;
        } else if (choice === 'keep-remote') {
          return environments.filter(e => e.id !== conflict.id);
        }
        break;
    }

    return environments;
  }

  private addItemToMerged(
    mergedItems: CollectionItem[],
    item: CollectionItem,
    sourceItems: CollectionItem[]
  ): CollectionItem[] {
    // Find parent in source and add to same parent in merged
    const parentId = this.findParentId(sourceItems, item.id);
    if (parentId) {
      return this.addItemToParent(mergedItems, parentId, structuredClone(item));
    }
    // Add to root
    return [...mergedItems, structuredClone(item)];
  }

  private findParentId(items: CollectionItem[], targetId: string, parentId: string | null = null): string | null {
    for (const item of items) {
      if (item.id === targetId) return parentId;
      if (item.items) {
        const found = this.findParentId(item.items, targetId, item.id);
        if (found !== null) return found;
      }
    }
    return null;
  }

  private findParentPath(path: string[]): string[] {
    return path.slice(0, -1);
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

  private addItemToPath(items: CollectionItem[], path: string[], newItem: CollectionItem): CollectionItem[] {
    if (path.length === 0) {
      return [...items, newItem];
    }
    // Find folder by name in path and recurse
    const [folderName, ...rest] = path;
    return items.map(item => {
      if (item.name === folderName && item.type === 'folder') {
        return {
          ...item,
          items: this.addItemToPath(item.items || [], rest, newItem)
        };
      }
      return item;
    });
  }

  private addItemAfter(items: CollectionItem[], afterId: string, newItem: CollectionItem): CollectionItem[] {
    const result: CollectionItem[] = [];
    for (const item of items) {
      result.push(item);
      if (item.id === afterId) {
        result.push(newItem);
      } else if (item.items) {
        const updated = this.addItemAfter(item.items, afterId, newItem);
        if (updated !== item.items) {
          result[result.length - 1] = { ...item, items: updated };
        }
      }
    }
    return result;
  }

  private updateItemInTree(items: CollectionItem[], itemId: string, newItem: CollectionItem): CollectionItem[] {
    return items.map(item => {
      if (item.id === itemId) {
        return structuredClone(newItem);
      }
      if (item.items) {
        return {
          ...item,
          items: this.updateItemInTree(item.items, itemId, newItem)
        };
      }
      return item;
    });
  }

  private removeItemFromTree(items: CollectionItem[], itemId: string): CollectionItem[] {
    return items
      .filter(item => item.id !== itemId)
      .map(item => {
        if (item.items) {
          return {
            ...item,
            items: this.removeItemFromTree(item.items, itemId)
          };
        }
        return item;
      });
  }
}

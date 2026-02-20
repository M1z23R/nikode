import { Pipe, PipeTransform } from '@angular/core';
import { TreeNode } from '@m1z23r/ngx-ui';
import { CollectionItem, CollectionSource, UnifiedCollection } from '../../core/models/collection.model';

export interface TreeNodeData {
  type: 'collection' | 'folder' | 'request' | 'websocket' | 'graphql';
  collectionPath: string;
  itemId: string | null;
  item?: CollectionItem;
  source?: CollectionSource;
  isReadOnly?: boolean;
}

@Pipe({
  name: 'collectionsToTree',
  pure: true
})
export class CollectionsToTreePipe implements PipeTransform {
  transform(collections: UnifiedCollection[], expandedFolders: Set<string>, searchQuery = ''): TreeNode[] {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return collections
        .map(col => this.collectionToSearchNode(col, query))
        .filter((node): node is TreeNode => node !== null);
    }
    return collections.map(col => this.collectionToTreeNode(col, expandedFolders));
  }

  private collectionToSearchNode(col: UnifiedCollection, query: string): TreeNode | null {
    const matches = this.collectMatches(col.collection.items, col.id, query, col.source, col.isReadOnly);
    if (matches.length === 0) return null;

    const data: TreeNodeData = {
      type: 'collection',
      collectionPath: col.id,
      itemId: null,
      source: col.source,
      isReadOnly: col.isReadOnly
    };

    const label = col.dirty ? `${col.name} *` : col.name;

    return { label, expanded: true, children: matches, data };
  }

  private collectMatches(
    items: CollectionItem[],
    collectionPath: string,
    query: string,
    source?: CollectionSource,
    isReadOnly?: boolean
  ): TreeNode[] {
    const results: TreeNode[] = [];
    for (const item of items) {
      if (item.type === 'folder') {
        // Recurse into folder children first
        const childMatches = item.items
          ? this.collectMatches(item.items, collectionPath, query, source, isReadOnly)
          : [];
        // Include child matches as flat results
        results.push(...childMatches);
        // Also include the folder itself if its name matches
        if (item.name.toLowerCase().includes(query)) {
          results.push(this.leafNode(item, collectionPath, source, isReadOnly));
        }
      } else {
        if (item.name.toLowerCase().includes(query)) {
          results.push(this.leafNode(item, collectionPath, source, isReadOnly));
        }
      }
    }
    return results;
  }

  private leafNode(
    item: CollectionItem,
    collectionPath: string,
    source?: CollectionSource,
    isReadOnly?: boolean
  ): TreeNode {
    const data: TreeNodeData = { type: item.type, collectionPath, itemId: item.id, item, source, isReadOnly };
    if (item.type === 'websocket') return { label: item.name, icon: 'WS', data };
    if (item.type === 'graphql') return { label: item.name, icon: 'GQL', data };
    if (item.type === 'folder') return { label: item.name, data };
    return { label: item.name, icon: item.method || 'GET', data };
  }

  private collectionToTreeNode(col: UnifiedCollection, expandedFolders: Set<string>): TreeNode {
    const data: TreeNodeData = {
      type: 'collection',
      collectionPath: col.id,
      itemId: null,
      source: col.source,
      isReadOnly: col.isReadOnly
    };

    const label = col.dirty ? `${col.name} *` : col.name;

    return {
      label,
      expanded: col.expanded,
      children: col.collection.items.map(item => this.itemToTreeNode(item, col.id, expandedFolders, col.source, col.isReadOnly)),
      data
    };
  }

  private itemToTreeNode(
    item: CollectionItem,
    collectionPath: string,
    expandedFolders: Set<string>,
    source?: CollectionSource,
    isReadOnly?: boolean
  ): TreeNode {
    const data: TreeNodeData = {
      type: item.type,
      collectionPath,
      itemId: item.id,
      item,
      source,
      isReadOnly
    };

    if (item.type === 'folder') {
      return {
        label: item.name,
        expanded: expandedFolders.has(item.id),
        children: item.items?.map(child => this.itemToTreeNode(child, collectionPath, expandedFolders, source, isReadOnly)) || [],
        data
      };
    } else if (item.type === 'websocket') {
      return {
        label: item.name,
        icon: 'WS',
        data
      };
    } else if (item.type === 'graphql') {
      return {
        label: item.name,
        icon: 'GQL',
        data
      };
    } else {
      return {
        label: item.name,
        icon: item.method || 'GET',
        data
      };
    }
  }
}

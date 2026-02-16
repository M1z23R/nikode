import { Pipe, PipeTransform } from '@angular/core';
import { TreeNode } from '@m1z23r/ngx-ui';
import { CollectionItem, CollectionSource, UnifiedCollection } from '../../core/models/collection.model';

export interface TreeNodeData {
  type: 'collection' | 'folder' | 'request';
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
  transform(collections: UnifiedCollection[], expandedFolders: Set<string>): TreeNode[] {
    return collections.map(col => this.collectionToTreeNode(col, expandedFolders));
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
    } else {
      return {
        label: item.name,
        icon: item.method || 'GET',
        data
      };
    }
  }
}

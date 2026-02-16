import { Pipe, PipeTransform } from '@angular/core';
import { TreeNode } from '@m1z23r/ngx-ui';
import { CollectionItem } from '../../core/models/collection.model';

export interface TreeNodeData {
  type: 'collection' | 'folder' | 'request';
  collectionPath: string;
  itemId: string | null;
  item?: CollectionItem;
}

interface OpenCollection {
  path: string;
  collection: {
    name: string;
    items: CollectionItem[];
  };
  expanded: boolean;
  dirty: boolean;
}

@Pipe({
  name: 'collectionsToTree',
  pure: true
})
export class CollectionsToTreePipe implements PipeTransform {
  transform(collections: OpenCollection[], expandedFolders: Set<string>): TreeNode[] {
    return collections.map(col => this.collectionToTreeNode(col, expandedFolders));
  }

  private collectionToTreeNode(col: OpenCollection, expandedFolders: Set<string>): TreeNode {
    const data: TreeNodeData = {
      type: 'collection',
      collectionPath: col.path,
      itemId: null
    };

    const label = col.dirty ? `${col.collection.name} *` : col.collection.name;

    return {
      label,
      expanded: col.expanded,
      children: col.collection.items.map(item => this.itemToTreeNode(item, col.path, expandedFolders)),
      data
    };
  }

  private itemToTreeNode(item: CollectionItem, collectionPath: string, expandedFolders: Set<string>): TreeNode {
    const data: TreeNodeData = {
      type: item.type,
      collectionPath,
      itemId: item.id,
      item
    };

    if (item.type === 'folder') {
      return {
        label: item.name,
        expanded: expandedFolders.has(item.id),
        children: item.items?.map(child => this.itemToTreeNode(child, collectionPath, expandedFolders)) || [],
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

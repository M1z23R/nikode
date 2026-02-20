import { Component, input, output } from '@angular/core';
import { TreeNode, DropdownComponent, DropdownItemComponent, DropdownDividerComponent, DropdownTriggerDirective, ContextMenuDirective } from '@m1z23r/ngx-ui';
import { TreeNodeData } from './collections-to-tree.pipe';

export interface NodeDropEvent {
  node: TreeNode;
  target: TreeNode;
  position: 'before' | 'after' | 'inside';
}

// Shared drag state across recursive component instances
const dragState = {
  node: null as TreeNode | null,
  overNodeId: null as string | null,
  position: null as 'before' | 'after' | 'inside' | null,
};

@Component({
  selector: 'app-collection-tree',
  imports: [DropdownComponent, DropdownItemComponent, DropdownDividerComponent, DropdownTriggerDirective, ContextMenuDirective],
  template: `
    @for (node of nodes(); track trackNode(node)) {
      <div class="tree-node" [style.padding-left.px]="level() * indent()">
        <div
          class="tree-node-content"
          [class.drag-over-before]="isDragOver(node, 'before')"
          [class.drag-over-after]="isDragOver(node, 'after')"
          [class.drag-over-inside]="isDragOver(node, 'inside')"
          [class.dragging]="isDragging(node)"
          [attr.draggable]="isDraggable(node)"
          (click)="onNodeClick(node)"
          (dragstart)="onDragStart($event, node)"
          (dragend)="onDragEnd()"
          (dragover)="onDragOver($event, node)"
          (dragleave)="onDragLeave(node)"
          (drop)="onDrop($event, node)"
          [uiContextMenu]="dropdown"
        >
          @if (isExpandable(node)) {
            <span class="tree-node-toggle" [class.expanded]="node.expanded">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </span>
          }
          @if (getNodeType(node) === 'collection') {
            @if (isCloud(node)) {
              <span class="tree-node-source-icon" title="Cloud collection">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                </svg>
              </span>
            }
            @if (isReadOnly(node)) {
              <span class="tree-node-lock-icon" title="Read-only (offline)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
            }
          }
          @if (node.icon) {
            <span [class]="'tree-node-icon method method-chip ' + node.icon">{{ node.icon }}</span>
          }
          <span class="tree-node-label">{{ node.label }}</span>
          <ui-dropdown #dropdown class="tree-node-actions" [closeOnSelect]="true">
            <span
              uiDropdownTrigger
              class="tree-node-dots"
              (click)="onActionsClick($event)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
              </svg>
            </span>
            @if (!isReadOnly(node)) {
              <ui-dropdown-item (clicked)="action.emit({ type: 'run', node })">Run</ui-dropdown-item>
              @if (getNodeType(node) === 'request') {
                <ui-dropdown-item (clicked)="action.emit({ type: 'copyAsCurl', node })">Copy as cURL</ui-dropdown-item>
              }
              <ui-dropdown-divider />
            }
            @if (!isReadOnly(node) && (getNodeType(node) === 'collection' || getNodeType(node) === 'folder')) {
              <ui-dropdown-item (clicked)="action.emit({ type: 'newFolder', node })">New Folder</ui-dropdown-item>
              <ui-dropdown-item (clicked)="action.emit({ type: 'newRequest', node })">New Request</ui-dropdown-item>
              <ui-dropdown-divider />
            }
            @if (getNodeType(node) === 'collection') {
              <ui-dropdown-item (clicked)="action.emit({ type: 'save', node })">Save</ui-dropdown-item>
              @if (isCloud(node)) {
                <ui-dropdown-item (clicked)="action.emit({ type: 'sync', node })">Sync</ui-dropdown-item>
              } @else {
                <ui-dropdown-item (clicked)="action.emit({ type: 'export', node })">Export</ui-dropdown-item>
                <ui-dropdown-item (clicked)="action.emit({ type: 'pushToCloud', node })">Push to Cloud...</ui-dropdown-item>
              }
              <ui-dropdown-item (clicked)="action.emit({ type: 'close', node })">Close</ui-dropdown-item>
              <ui-dropdown-divider />
              <ui-dropdown-item (clicked)="action.emit({ type: 'deleteCollection', node })">Delete Collection</ui-dropdown-item>
            } @else if (!isReadOnly(node)) {
              <ui-dropdown-item (clicked)="action.emit({ type: 'duplicate', node })">Duplicate</ui-dropdown-item>
              <ui-dropdown-item (clicked)="action.emit({ type: 'rename', node })">Rename</ui-dropdown-item>
              <ui-dropdown-item (clicked)="action.emit({ type: 'delete', node })">Delete</ui-dropdown-item>
            }
          </ui-dropdown>
        </div>
        @if (node.expanded && isExpandable(node)) {
          @if (node.children?.length) {
            <app-collection-tree
              [nodes]="node.children!"
              [level]="level() + 1"
              [indent]="indent()"
              (nodeClick)="nodeClick.emit($event)"
              (action)="action.emit($event)"
              (nodeDrop)="nodeDrop.emit($event)"
            />
          } @else {
            <div class="tree-node-placeholder" [style.padding-left.px]="(level() + 1) * indent()">
              @if (!isReadOnly(node)) {
                <span class="placeholder-text" (click)="action.emit({ type: 'newRequest', node })">+ New request</span>
              } @else {
                <span class="placeholder-text readonly">No items</span>
              }
            </div>
          }
        }
      </div>
    }
  `,
  styles: [`
    .tree-node-content {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.5rem;
      cursor: pointer;
      border-radius: 4px;
      position: relative;

      &:hover {
        background-color: var(--ui-bg-secondary);

        .tree-node-actions {
          opacity: 1;
        }
      }

      &[draggable="true"] {
        cursor: grab;
      }

      &.dragging {
        opacity: 0.4;
      }

      &.drag-over-before::before {
        content: '';
        position: absolute;
        top: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--ui-primary, #3b82f6);
        border-radius: 1px;
        z-index: 1;
      }

      &.drag-over-after::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--ui-primary, #3b82f6);
        border-radius: 1px;
        z-index: 1;
      }

      &.drag-over-inside {
        background-color: color-mix(in srgb, var(--ui-primary, #3b82f6) 15%, transparent);
        outline: 1px solid var(--ui-primary, #3b82f6);
        outline-offset: -1px;
      }
    }

    .tree-node-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 12px;
      height: 12px;
      transition: transform 0.15s ease;

      &.expanded {
        transform: rotate(90deg);
      }

    }

    .tree-node-source-icon {
      display: flex;
      align-items: center;
      color: var(--ui-text-muted);
    }

    .tree-node-lock-icon {
      display: flex;
      align-items: center;
      color: var(--ui-warning, #f59e0b);
    }

    .tree-node-icon {
      font-size: 0.75rem;
      font-weight: 600;
      min-width: 2rem;
      text-align: center;
    }

    .tree-node-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tree-node-actions {
      opacity: 0;
      margin-left: auto;
      transition: opacity 0.15s ease;

      &:focus-within, &:has(.ui-dropdown__content) {
        opacity: 1;
      }
    }

    .tree-node-dots {
      display: flex;
      align-items: center;
      cursor: pointer;
      color: var(--ui-text-muted);

      &:hover {
        color: var(--ui-text);
      }
    }

    .tree-node-placeholder {
      padding: 0.375rem 0.5rem;
    }

    .placeholder-text {
      color: var(--ui-text-muted);
      font-size: 0.8125rem;
      cursor: pointer;

      &:hover:not(.readonly) {
        color: var(--ui-text);
      }

      &.readonly {
        cursor: default;
        font-style: italic;
      }
    }
  `]
})
export class CollectionTreeComponent {
  nodes = input.required<TreeNode[]>();
  level = input(0);
  indent = input(16);

  nodeClick = output<TreeNode>();
  action = output<{ type: string; node: TreeNode }>();
  nodeDrop = output<NodeDropEvent>();

  trackNode(node: TreeNode): string {
    const data = node.data as TreeNodeData;
    return data.collectionPath + ':' + data.itemId;
  }

  getNodeType(node: TreeNode): 'collection' | 'folder' | 'request' | 'websocket' | 'graphql' {
    return (node.data as TreeNodeData)?.type ?? 'collection';
  }

  isExpandable(node: TreeNode): boolean {
    const type = this.getNodeType(node);
    return type === 'collection' || type === 'folder';
  }

  isCloud(node: TreeNode): boolean {
    return (node.data as TreeNodeData)?.source === 'cloud';
  }

  isReadOnly(node: TreeNode): boolean {
    return (node.data as TreeNodeData)?.isReadOnly ?? false;
  }

  isDraggable(node: TreeNode): boolean {
    const type = this.getNodeType(node);
    return type !== 'collection' && !this.isReadOnly(node);
  }

  isDragging(node: TreeNode): boolean {
    return dragState.node === node;
  }

  isDragOver(node: TreeNode, position: 'before' | 'after' | 'inside'): boolean {
    const data = node.data as TreeNodeData;
    const nodeId = data.collectionPath + ':' + data.itemId;
    return dragState.overNodeId === nodeId && dragState.position === position;
  }

  onDragStart(event: DragEvent, node: TreeNode): void {
    if (!this.isDraggable(node)) {
      event.preventDefault();
      return;
    }
    dragState.node = node;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', '');
  }

  onDragEnd(): void {
    dragState.node = null;
    dragState.overNodeId = null;
    dragState.position = null;
  }

  onDragOver(event: DragEvent, node: TreeNode): void {
    if (!dragState.node) return;

    const dragData = dragState.node.data as TreeNodeData;
    const targetData = node.data as TreeNodeData;

    // Prevent cross-collection drag
    if (dragData.collectionPath !== targetData.collectionPath) return;

    // Prevent dragging onto self
    if (dragData.itemId === targetData.itemId) return;

    // Prevent dropping on read-only collections
    if (targetData.isReadOnly) return;

    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;
    const targetType = targetData.type;

    const nodeId = targetData.collectionPath + ':' + targetData.itemId;

    // Only folders and collections accept "inside" drops
    const canDropInside = targetType === 'folder' || targetType === 'collection';

    if (canDropInside) {
      if (y < height * 0.25) {
        dragState.position = targetType === 'collection' ? 'inside' : 'before';
      } else if (y > height * 0.75) {
        dragState.position = targetType === 'collection' ? 'inside' : 'after';
      } else {
        dragState.position = 'inside';
      }
    } else {
      // Non-folders: only before/after
      dragState.position = y < height * 0.5 ? 'before' : 'after';
    }

    dragState.overNodeId = nodeId;
  }

  onDragLeave(node: TreeNode): void {
    const data = node.data as TreeNodeData;
    const nodeId = data.collectionPath + ':' + data.itemId;
    if (dragState.overNodeId === nodeId) {
      dragState.overNodeId = null;
      dragState.position = null;
    }
  }

  onDrop(event: DragEvent, node: TreeNode): void {
    event.preventDefault();
    if (!dragState.node || !dragState.position) return;

    const dragData = dragState.node.data as TreeNodeData;
    const targetData = node.data as TreeNodeData;

    // Same validations as dragover
    if (dragData.collectionPath !== targetData.collectionPath) return;
    if (dragData.itemId === targetData.itemId) return;
    if (targetData.isReadOnly) return;

    this.nodeDrop.emit({
      node: dragState.node,
      target: node,
      position: dragState.position,
    });

    dragState.node = null;
    dragState.overNodeId = null;
    dragState.position = null;
  }

  onNodeClick(node: TreeNode): void {
    this.nodeClick.emit(node);
  }

  onActionsClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}

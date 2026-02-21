import { Component, inject, signal, afterNextRender, ElementRef, Injector } from '@angular/core';
import {
  DialogService,
  ButtonComponent,
  InputComponent,
  TreeNode,
  ToastService
} from '@m1z23r/ngx-ui';
import { CollectionService } from '../../core/services/collection.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { GraphQLService } from '../../core/services/graphql.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { AuthService } from '../../core/services/auth.service';
import { NewCollectionDialogComponent, NewCollectionDialogResult } from './dialogs/new-collection.dialog';
import { NewFolderDialogComponent } from './dialogs/new-folder.dialog';
import { NewRequestDialogComponent, NewRequestDialogResult } from './dialogs/new-request.dialog';
import { InputDialogComponent, InputDialogData } from '../../shared/dialogs/input.dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/dialogs/confirm.dialog';
import { ExportCollectionDialogComponent, ExportFormat, ExportCollectionDialogData } from '../../shared/dialogs/export-collection.dialog';
import { RunnerDialogComponent, RunnerDialogData } from '../runner/runner.dialog';
import { PushToCloudDialogComponent, PushToCloudDialogData } from '../workspaces/push-to-cloud.dialog';
import { PublishTemplateDialogComponent, PublishTemplateDialogData, PublishTemplateDialogResult } from '../../shared/dialogs/publish-template.dialog';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { TemplateService } from '../../core/services/template.service';
import { CollectionsToTreePipe, TreeNodeData } from './collections-to-tree.pipe';
import { CollectionTreeComponent, NodeDropEvent } from './collection-tree.component';
import { generateCurl } from '../../core/utils/curl';
import { createOpenRequest } from '../../core/models/request.model';


@Component({
  selector: 'app-sidebar',
  imports: [
    ButtonComponent,
    InputComponent,
    CollectionsToTreePipe,
    CollectionTreeComponent
  ],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Collections</span>
        <div class="sidebar-actions">
          <ui-button variant="ghost" size="sm" (clicked)="toggleSearch()" title="Search Collections"
                     [class.search-active]="searchActive()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </ui-button>
          <ui-button variant="ghost" size="sm" (clicked)="openCollection()" title="Open Collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </ui-button>
          <ui-button variant="ghost" size="sm" (clicked)="openNewDialog()" title="New Collection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </ui-button>
        </div>
      </div>

      @if (searchActive()) {
        <div class="search-row">
          <ui-input #searchInput
            placeholder="Search collections..."
            [value]="searchQuery()"
            (valueChange)="searchQuery.set($event.toString())"
            (keydown.escape)="closeSearch()"
          />
        </div>
      }

      <div class="sidebar-content">
        @if (unifiedCollectionService.collections().length === 0) {
          <div class="empty-collections">
            <p>No collections open</p>
          </div>
        } @else {
          <app-collection-tree
            [nodes]="unifiedCollectionService.collections() | collectionsToTree:expandedFolders():searchQuery()"
            [indent]="16"
            (nodeClick)="onNodeClick($event)"
            (action)="onTreeAction($event)"
            (nodeDrop)="onNodeDrop($event)"
          />
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--ui-border);
    }

    .sidebar-title {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .sidebar-actions {
      display: flex;
      gap: 0.25rem;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
    }

    .empty-collections {
      padding: 1rem;
      text-align: center;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }

    .search-row {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--ui-border);
    }

    .search-active {
      color: var(--ui-primary);
    }
  `]
})
export class SidebarComponent {
  protected collectionService = inject(CollectionService);
  protected unifiedCollectionService = inject(UnifiedCollectionService);
  protected workspace = inject(WorkspaceService);
  protected webSocketService = inject(WebSocketService);
  protected graphqlService = inject(GraphQLService);
  private dialogService = inject(DialogService);
  private environmentService = inject(EnvironmentService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  protected cloudWorkspaceService = inject(CloudWorkspaceService);
  private templateService = inject(TemplateService);

  expandedFolders = signal<Set<string>>(new Set());
  searchActive = signal(false);
  searchQuery = signal('');

  private el = inject(ElementRef);
  private injector = inject(Injector);

  toggleSearch(): void {
    if (this.searchActive()) {
      this.closeSearch();
    } else {
      this.searchActive.set(true);
      afterNextRender(() => {
        const input = this.el.nativeElement.querySelector('.search-row input') as HTMLInputElement | null;
        input?.focus();
      }, { injector: this.injector });
    }
  }

  closeSearch(): void {
    this.searchActive.set(false);
    this.searchQuery.set('');
  }

  onNodeClick(node: TreeNode): void {
    const nodeData = node.data as TreeNodeData;

    if (nodeData.type === 'collection') {
      this.unifiedCollectionService.toggleExpanded(nodeData.collectionPath);
    } else if (nodeData.type === 'folder') {
      this.toggleFolder(nodeData.itemId!);
    } else if (nodeData.type === 'request') {
      this.workspace.openRequest(nodeData.collectionPath, nodeData.itemId!);
      this.closeSearch();
    } else if (nodeData.type === 'websocket') {
      this.webSocketService.openWebSocket(nodeData.collectionPath, nodeData.itemId!);
      this.closeSearch();
    } else if (nodeData.type === 'graphql') {
      this.graphqlService.openGraphQL(nodeData.collectionPath, nodeData.itemId!);
      this.closeSearch();
    }
  }

  private toggleFolder(folderId: string): void {
    this.expandedFolders.update(set => {
      const newSet = new Set(set);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }

  onTreeAction(event: { type: string; node: TreeNode }): void {
    const nodeData = event.node.data as TreeNodeData;

    switch (event.type) {
      case 'run':
        this.openRunner(nodeData, event.node.label);
        break;
      case 'copyAsCurl':
        this.copyAsCurl(nodeData);
        break;
      case 'newFolder':
        this.addFolder(nodeData);
        break;
      case 'newRequest':
        this.addRequest(nodeData);
        break;
      case 'save':
        this.unifiedCollectionService.save(nodeData.collectionPath);
        break;
      case 'sync':
        this.unifiedCollectionService.syncCloudCollection(nodeData.collectionPath);
        break;
      case 'export':
        this.exportCollection(nodeData);
        break;
      case 'pushToCloud':
        this.pushToCloud(nodeData);
        break;
      case 'publishAsTemplate':
        this.publishAsTemplate(nodeData);
        break;
      case 'close':
        this.unifiedCollectionService.close(nodeData.collectionPath);
        break;
      case 'rename':
        this.renameItem(nodeData);
        break;
      case 'delete':
        this.deleteItem(nodeData);
        break;
      case 'duplicate':
        this.duplicateItem(nodeData);
        break;
      case 'deleteCollection':
        this.deleteCollection(nodeData);
        break;
    }
  }

  onNodeDrop(event: NodeDropEvent): void {
    const dragData = event.node.data as TreeNodeData;
    const targetData = event.target.data as TreeNodeData;

    if (dragData.collectionPath !== targetData.collectionPath) return;
    if (targetData.isReadOnly) return;
    if (!dragData.itemId) return;

    // For collection-level targets, drop "inside" at root
    const targetId = targetData.type === 'collection' ? null : targetData.itemId;
    const position = targetData.type === 'collection' ? 'inside' as const : event.position;

    this.unifiedCollectionService.moveItem(
      dragData.collectionPath,
      dragData.itemId,
      targetId,
      position,
    );
  }

  async openCollection(): Promise<void> {
    await this.collectionService.openWithDialog();
  }

  async openNewDialog(): Promise<void> {
    const ref = this.dialogService.open<NewCollectionDialogComponent, void, NewCollectionDialogResult | undefined>(
      NewCollectionDialogComponent
    );
    const result = await ref.afterClosed();
    if (result) {
      // If a template was selected, fetch its data
      let templateData: any = null;
      if (result.templateId) {
        try {
          const template = await this.templateService.getById(result.templateId);
          templateData = template.data;
        } catch (error) {
          console.error('Failed to fetch template:', error);
          this.toastService.error('Failed to load template');
        }
      }

      if (result.type === 'cloud' && result.workspaceId) {
        await this.unifiedCollectionService.createCloudCollection(result.workspaceId, result.name, templateData);
      } else if (result.path) {
        await this.collectionService.createCollection(result.path, result.name, templateData);
      }
    }
  }

  async exportCollection(nodeData: TreeNodeData): Promise<void> {
    // Only local collections can be exported
    if (nodeData.source === 'cloud') {
      this.toastService.error('Cloud collections cannot be exported directly');
      return;
    }

    const col = this.unifiedCollectionService.getCollection(nodeData.collectionPath);
    if (!col) return;

    const ref = this.dialogService.open<ExportCollectionDialogComponent, ExportCollectionDialogData, ExportFormat | undefined>(
      ExportCollectionDialogComponent,
      { data: { collectionName: col.name } }
    );
    const format = await ref.afterClosed();

    if (!format) {
      return; // User cancelled
    }

    if (format === 'openapi') {
      await this.collectionService.exportOpenApi(nodeData.collectionPath);
    } else {
      await this.collectionService.exportCollection(nodeData.collectionPath, format);
    }
  }

  private openRunner(target: TreeNodeData, label: string): void {
    // Clean up the label (remove dirty indicator if present)
    const cleanLabel = label.endsWith(' *') ? label.slice(0, -2) : label;

    this.dialogService.open<RunnerDialogComponent, RunnerDialogData, void>(
      RunnerDialogComponent,
      {
        data: {
          collectionPath: target.collectionPath,
          targetId: target.itemId,
          targetType: target.type,
          targetName: cleanLabel,
        },
      }
    );
  }

  private async addFolder(target: TreeNodeData): Promise<void> {
    const ref = this.dialogService.open<NewFolderDialogComponent, void, string | undefined>(
      NewFolderDialogComponent
    );
    const name = await ref.afterClosed();
    if (name) {
      const item = {
        id: `folder-${Date.now()}`,
        type: 'folder' as const,
        name,
        items: []
      };
      this.unifiedCollectionService.addItem(target.collectionPath, target.itemId, item);
    }
  }

  private async addRequest(target: TreeNodeData): Promise<void> {
    const ref = this.dialogService.open<NewRequestDialogComponent, void, NewRequestDialogResult | undefined>(
      NewRequestDialogComponent
    );
    const result = await ref.afterClosed();
    if (result) {
      if (result.type === 'websocket') {
        const item = {
          id: `ws-${Date.now()}`,
          type: 'websocket' as const,
          name: result.name,
          url: result.url ?? '',
          headers: [],
          wsProtocols: [],
          wsAutoReconnect: false,
          wsReconnectInterval: 5000,
          wsSavedMessages: []
        };
        this.unifiedCollectionService.addItem(target.collectionPath, target.itemId, item);
      } else if (result.type === 'graphql') {
        const item = {
          id: `gql-${Date.now()}`,
          type: 'graphql' as const,
          name: result.name,
          url: result.url ?? '',
          headers: [],
          gqlQuery: '',
          gqlVariables: '',
          gqlOperationName: ''
        };
        this.unifiedCollectionService.addItem(target.collectionPath, target.itemId, item);
      } else {
        const defaultHeaders = [
          { key: 'User-Agent', value: 'Nikode/1.0', enabled: true },
          { key: '', value: '', enabled: true }
        ];

        const item = {
          id: `req-${Date.now()}`,
          type: 'request' as const,
          name: result.name,
          method: result.method,
          url: result.url ?? '',
          params: result.params?.length
            ? [...result.params, { key: '', value: '', enabled: true }]
            : [],
          headers: result.headers?.length
            ? [...result.headers, { key: '', value: '', enabled: true }]
            : defaultHeaders,
          body: result.body ?? { type: 'none' as const },
          auth: result.auth,
          scripts: { pre: '', post: '' }
        };
        this.unifiedCollectionService.addItem(target.collectionPath, target.itemId, item);
      }
    }
  }

  private async renameItem(target: TreeNodeData): Promise<void> {
    const ref = this.dialogService.open<InputDialogComponent, InputDialogData, string | undefined>(
      InputDialogComponent,
      {
        data: {
          title: 'Rename',
          label: 'Enter new name',
          initialValue: target.item?.name,
          submitLabel: 'Rename'
        }
      }
    );
    const newName = await ref.afterClosed();
    if (newName && target.itemId) {
      this.unifiedCollectionService.updateItem(target.collectionPath, target.itemId, { name: newName });
    }
  }

  private async deleteItem(target: TreeNodeData): Promise<void> {
    if (!target.itemId) return;

    const itemName = target.item?.name || 'this item';
    const ref = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Item',
          message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
          confirmLabel: 'Delete',
          confirmColor: 'danger'
        }
      }
    );

    const confirmed = await ref.afterClosed();
    if (confirmed) {
      this.unifiedCollectionService.deleteItem(target.collectionPath, target.itemId);
    }
  }

  private duplicateItem(target: TreeNodeData): void {
    if (!target.itemId) return;
    this.unifiedCollectionService.cloneItem(target.collectionPath, target.itemId);
  }

  private async deleteCollection(target: TreeNodeData): Promise<void> {
    const col = this.unifiedCollectionService.getCollection(target.collectionPath);
    if (!col) return;

    // For cloud collections, check if user is owner
    if (target.source === 'cloud' && !this.unifiedCollectionService.canDeleteCloudCollection()) {
      this.toastService.error('Only workspace owners can delete collections');
      return;
    }

    const collectionName = col.name;
    const isCloud = target.source === 'cloud';
    const message = isCloud
      ? `Are you sure you want to delete the cloud collection "${collectionName}"? This will permanently delete it from the cloud and cannot be undone.`
      : `Are you sure you want to delete the collection "${collectionName}"? This will delete the collection folder from disk and cannot be undone.`;

    const ref = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Collection',
          message,
          confirmLabel: 'Delete',
          confirmColor: 'danger'
        }
      }
    );

    const confirmed = await ref.afterClosed();
    if (confirmed) {
      await this.unifiedCollectionService.deleteCollection(target.collectionPath);
    }
  }

  private async copyAsCurl(target: TreeNodeData): Promise<void> {
    if (!target.item || target.type !== 'request') return;

    const openRequest = createOpenRequest(target.collectionPath, target.item);
    const variables = this.environmentService.resolveVariables(target.collectionPath);
    const proxyRequest = this.workspace.buildProxyRequest(openRequest, variables);
    const curl = generateCurl(proxyRequest);

    try {
      await navigator.clipboard.writeText(curl);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  }

  private pushToCloud(target: TreeNodeData): void {
    if (!this.authService.isAuthenticated()) {
      this.toastService.error('Please sign in to push collections to cloud');
      return;
    }

    const col = this.unifiedCollectionService.getCollection(target.collectionPath);
    if (!col) return;

    this.dialogService.open<PushToCloudDialogComponent, PushToCloudDialogData, void>(
      PushToCloudDialogComponent,
      {
        data: {
          collectionPath: target.collectionPath,
          collectionName: col.name
        }
      }
    );
  }

  private publishAsTemplate(target: TreeNodeData): void {
    const col = this.unifiedCollectionService.getCollection(target.collectionPath);
    if (!col) return;

    this.dialogService.open<PublishTemplateDialogComponent, PublishTemplateDialogData, PublishTemplateDialogResult | undefined>(
      PublishTemplateDialogComponent,
      {
        data: {
          collectionName: col.name,
          collection: col.collection
        }
      }
    );
  }
}

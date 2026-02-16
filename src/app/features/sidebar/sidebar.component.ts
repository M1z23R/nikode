import { Component, inject, signal } from '@angular/core';
import {
  DialogService,
  ButtonComponent,
  TreeNode,
  ToastService
} from '@m1z23r/ngx-ui';
import { CollectionService } from '../../core/services/collection.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { AuthService } from '../../core/services/auth.service';
import { NewCollectionDialogComponent, NewCollectionDialogResult } from './dialogs/new-collection.dialog';
import { NewFolderDialogComponent } from './dialogs/new-folder.dialog';
import { NewRequestDialogComponent, NewRequestDialogResult } from './dialogs/new-request.dialog';
import { InputDialogComponent, InputDialogData } from '../../shared/dialogs/input.dialog';
import { ExportCollectionDialogComponent, ExportFormat, ExportCollectionDialogData } from '../../shared/dialogs/export-collection.dialog';
import { RunnerDialogComponent, RunnerDialogData } from '../runner/runner.dialog';
import { PushToCloudDialogComponent, PushToCloudDialogData } from '../workspaces/push-to-cloud.dialog';
import { CloudCollectionsComponent } from '../workspaces/cloud-collections.component';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { CollectionsToTreePipe, TreeNodeData } from './collections-to-tree.pipe';
import { CollectionTreeComponent } from './collection-tree.component';
import { generateCurl } from '../../core/utils/curl';
import { createOpenRequest } from '../../core/models/request.model';


@Component({
  selector: 'app-sidebar',
  imports: [
    ButtonComponent,
    CollectionsToTreePipe,
    CollectionTreeComponent,
    CloudCollectionsComponent
  ],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Collections</span>
        <div class="sidebar-actions">
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

      <div class="sidebar-content">
        @if (collectionService.collections().length === 0) {
          <div class="empty-collections">
            <p>No collections open</p>
          </div>
        } @else {
          <app-collection-tree
            [nodes]="collectionService.collections() | collectionsToTree:expandedFolders()"
            [indent]="16"
            (nodeClick)="onNodeClick($event)"
            (action)="onTreeAction($event)"
          />
        }
      </div>
      @if (cloudWorkspaceService.activeWorkspace()) {
        <app-cloud-collections />
      }
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
  `]
})
export class SidebarComponent {
  protected collectionService = inject(CollectionService);
  protected workspace = inject(WorkspaceService);
  private dialogService = inject(DialogService);
  private environmentService = inject(EnvironmentService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  protected cloudWorkspaceService = inject(CloudWorkspaceService);

  expandedFolders = signal<Set<string>>(new Set());

  onNodeClick(node: TreeNode): void {
    const nodeData = node.data as TreeNodeData;

    if (nodeData.type === 'collection') {
      this.collectionService.toggleExpanded(nodeData.collectionPath);
    } else if (nodeData.type === 'folder') {
      this.toggleFolder(nodeData.itemId!);
    } else if (nodeData.type === 'request') {
      this.workspace.openRequest(nodeData.collectionPath, nodeData.itemId!);
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
        this.collectionService.saveCollection(nodeData.collectionPath);
        break;
      case 'export':
        this.exportCollection(nodeData);
        break;
      case 'pushToCloud':
        this.pushToCloud(nodeData);
        break;
      case 'close':
        this.collectionService.closeCollection(nodeData.collectionPath);
        break;
      case 'rename':
        this.renameItem(nodeData);
        break;
      case 'delete':
        this.deleteItem(nodeData);
        break;
    }
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
      this.collectionService.createCollection(result.path, result.name);
    }
  }

  async exportCollection(nodeData: TreeNodeData): Promise<void> {
    const col = this.collectionService.getCollection(nodeData.collectionPath);
    if (!col) return;

    const ref = this.dialogService.open<ExportCollectionDialogComponent, ExportCollectionDialogData, ExportFormat | undefined>(
      ExportCollectionDialogComponent,
      { data: { collectionName: col.collection.name } }
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
      this.collectionService.addItem(target.collectionPath, target.itemId, item);
    }
  }

  private async addRequest(target: TreeNodeData): Promise<void> {
    const ref = this.dialogService.open<NewRequestDialogComponent, void, NewRequestDialogResult | undefined>(
      NewRequestDialogComponent
    );
    const result = await ref.afterClosed();
    if (result) {
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
        scripts: { pre: '', post: '' }
      };
      this.collectionService.addItem(target.collectionPath, target.itemId, item);
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
      this.collectionService.updateItem(target.collectionPath, target.itemId, { name: newName });
    }
  }

  private deleteItem(target: TreeNodeData): void {
    if (target.itemId && confirm('Are you sure you want to delete this item?')) {
      this.collectionService.deleteItem(target.collectionPath, target.itemId);
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

    const col = this.collectionService.getCollection(target.collectionPath);
    if (!col) return;

    this.dialogService.open<PushToCloudDialogComponent, PushToCloudDialogData, void>(
      PushToCloudDialogComponent,
      {
        data: {
          collectionPath: target.collectionPath,
          collectionName: col.collection.name
        }
      }
    );
  }
}

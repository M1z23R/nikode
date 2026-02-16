import { Component, inject } from '@angular/core';
import { ButtonComponent, ToastService } from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { CollectionService } from '../../core/services/collection.service';
import { CloudCollection } from '../../core/models/cloud.model';

@Component({
  selector: 'app-cloud-collections',
  imports: [ButtonComponent],
  template: `
    <div class="cloud-collections">
      <div class="section-header">
        <span class="section-title">Cloud Collections</span>
        @if (cloudWorkspaceService.isLoading()) {
          <svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
        }
      </div>

      @if (!cloudWorkspaceService.activeWorkspace()) {
        <div class="empty-state">
          <p>Select a workspace to view collections</p>
        </div>
      } @else if (cloudWorkspaceService.collections().length === 0) {
        <div class="empty-state">
          <p>No collections in this workspace</p>
        </div>
      } @else {
        <div class="collections-list">
          @for (collection of cloudWorkspaceService.collections(); track collection.id) {
            <div class="collection-item">
              <div class="collection-info" (click)="openCollection(collection)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span class="collection-name">{{ collection.name }}</span>
              </div>
              <div class="collection-actions">
                <ui-button variant="ghost" size="sm" (clicked)="deleteCollection(collection)" title="Delete">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </ui-button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cloud-collections {
      border-top: 1px solid var(--ui-border);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--ui-border);
    }

    .section-title {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .spinner {
      animation: spin 0.8s linear infinite;
      color: var(--ui-text-muted);
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .empty-state {
      padding: 1rem;
      text-align: center;
      color: var(--ui-text-muted);
      font-size: 0.8125rem;
    }

    .collections-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .collection-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--ui-bg-secondary);
      }
    }

    .collection-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      flex: 1;
      min-width: 0;
    }

    .collection-name {
      font-size: 0.8125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .collection-actions {
      display: flex;
      gap: 0.25rem;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .collection-item:hover .collection-actions {
      opacity: 1;
    }
  `]
})
export class CloudCollectionsComponent {
  readonly cloudWorkspaceService = inject(CloudWorkspaceService);
  private collectionService = inject(CollectionService);
  private toastService = inject(ToastService);

  async openCollection(collection: CloudCollection): Promise<void> {
    // For now, we'll show a toast - full implementation would download and open
    this.toastService.info(`Opening "${collection.name}"...`);
    // TODO: Implement pull to local and open
  }

  async deleteCollection(collection: CloudCollection): Promise<void> {
    const workspace = this.cloudWorkspaceService.activeWorkspace();
    if (!workspace) return;

    if (!confirm(`Are you sure you want to delete "${collection.name}"?`)) {
      return;
    }

    try {
      await this.cloudWorkspaceService.deleteCollection(workspace.id, collection.id);
      this.toastService.success('Collection deleted');
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to delete collection');
    }
  }
}

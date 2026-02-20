import { Component, inject, signal, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  AccordionComponent,
  AccordionItemComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  ToastService
} from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace, WorkspaceApiKey, WorkspaceApiKeyCreated } from '../../core/models/cloud.model';

interface ManageWorkspaceDialogData {
  workspace: Workspace;
}

@Component({
  selector: 'app-manage-workspace-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, AccordionComponent, AccordionItemComponent],
  template: `
    <ui-modal [title]="'Manage ' + data.workspace.name" size="lg">
      <div class="manage-workspace-view">
        <h3 class="section-title">API Keys</h3>
        <p class="section-description">
          API keys allow CI/CD pipelines and external tools to sync OpenAPI specs to your workspace.
        </p>

        <div class="create-key-section">
          <ui-input
            label="Key Name"
            [(value)]="newKeyName"
            placeholder="e.g., CI/CD Pipeline"
            (keydown.enter)="createApiKey()" />
          <ui-input
            label="Expires (optional)"
            [(value)]="newKeyExpires"
            placeholder="YYYY-MM-DD" />
          <ui-button
            color="primary"
            (clicked)="createApiKey()"
            [disabled]="!newKeyName().trim() || isCreating()">
            {{ isCreating() ? 'Creating...' : 'Create Key' }}
          </ui-button>
        </div>

        @if (newlyCreatedKey()) {
          <div class="new-key-banner">
            <div class="new-key-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Copy your API key now. It won't be shown again!</span>
            </div>
            <div class="new-key-value">
              <code>{{ newlyCreatedKey() }}</code>
              <ui-button variant="ghost" size="sm" (clicked)="copyKey()">
                Copy
              </ui-button>
            </div>
          </div>
        }

        @if (isLoading()) {
          <div class="loading-state">Loading API keys...</div>
        } @else if (apiKeys().length === 0) {
          <div class="empty-state">No API keys yet</div>
        } @else {
          <div class="api-keys-list">
            @for (key of apiKeys(); track key.id) {
              <div class="api-key-item">
                <div class="api-key-info">
                  <div class="api-key-name">{{ key.name }}</div>
                  <div class="api-key-meta">
                    <span class="api-key-prefix">{{ key.key_prefix }}...</span>
                    <span class="api-key-date">Created {{ formatDate(key.created_at) }}</span>
                    @if (key.expires_at) {
                      <span class="api-key-expires" [class.expired]="isExpired(key.expires_at)">
                        {{ isExpired(key.expires_at) ? 'Expired' : 'Expires' }} {{ formatDate(key.expires_at) }}
                      </span>
                    }
                  </div>
                </div>
                <ui-button variant="ghost" size="sm" color="danger" (clicked)="revokeKey(key)">
                  Revoke
                </ui-button>
              </div>
            }
          </div>
        }

        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }

        <ui-accordion class="info-accordion">
          <ui-accordion-item header="Collection IDs">
            <div class="usage-content">
              @if (collections().length === 0) {
                <p class="usage-note">No collections in this workspace yet.</p>
              } @else {
                <p class="usage-note">Use these IDs with <code>collection_id</code> to target a specific collection.</p>
                <div class="collection-id-list">
                  @for (col of collections(); track col.id) {
                    <div class="collection-id-item">
                      <span class="collection-id-name">{{ col.name }}</span>
                      <code class="collection-id-value" (click)="copyCollectionId(col.id)">{{ col.id }}</code>
                    </div>
                  }
                </div>
              }
            </div>
          </ui-accordion-item>
          <ui-accordion-item header="How to use API keys">
            <div class="usage-content">
              <p><strong>Automation Endpoint</strong></p>
              <p>Use your API key to upsert collections from OpenAPI/Swagger specs:</p>
              <pre><code>PUT /api/v1/automation/collections
Authorization: Bearer nik_xxxxx...
Content-Type: application/json

&#123;
  "name": "my-api",
  "spec": &#123; "openapi": "3.0.0", ... &#125;
&#125;</code></pre>
              <p><strong>Update Existing Collection by ID</strong></p>
              <p class="usage-note">Use <code>collection_id</code> to target a specific collection (copy it from the "Collection IDs" section above):</p>
              <pre><code>curl -X PUT "$URL/api/v1/automation/collections" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '&#123;
    "collection_id": "your-collection-uuid",
    "spec": &#123; "openapi": "3.0.0", ... &#125;
  &#125;'</code></pre>
              <p><strong>Conflict Resolution</strong></p>
              <p class="usage-note">
                Control what happens when a collection already exists using <code>resolution</code>:
              </p>
              <ul class="resolution-list">
                <li><code>"force"</code> (default) &mdash; overwrite unconditionally</li>
                <li><code>"clone"</code> &mdash; create a copy with " (copy)" suffix</li>
                <li><code>"fail"</code> &mdash; return 409 if the collection exists</li>
              </ul>
              <pre><code>&#123;
  "name": "my-api",
  "resolution": "clone",
  "spec": &#123; ... &#125;
&#125;</code></pre>
              <p><strong>YAML Support</strong></p>
              <p class="usage-note">
                You can send a raw YAML spec with <code>Content-Type: application/yaml</code>.
                Metadata goes in query params:
              </p>
              <pre><code>curl -X PUT "$URL/api/v1/automation/collections?name=my-api&amp;resolution=force" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/yaml" \
  --data-binary @openapi.yaml</code></pre>
              <p><strong>CI/CD Example (GitHub Actions)</strong></p>
              <pre><code>- name: Sync OpenAPI to Nikode
  run: |
    curl -X PUT "$NIKODE_URL/api/v1/automation/collections" \\
      -H "Authorization: Bearer $NIKODE_API_KEY" \\
      -H "Content-Type: application/json" \\
      -d '&#123;"name":"my-api","spec":'$(cat openapi.json)'&#125;'
  env:
    NIKODE_URL: your-nikode-instance-url
    NIKODE_API_KEY: your-api-key-here</code></pre>
            </div>
          </ui-accordion-item>
        </ui-accordion>
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .manage-workspace-view {
      min-height: 200px;
    }

    .section-title {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .section-description {
      margin: 0 0 0.75rem 0;
      font-size: 0.8125rem;
      color: var(--ui-text-muted);
    }

    .info-accordion {
      margin-top: 1rem;
      font-size: 0.8125rem;
    }

    .usage-content {
      padding: 0.75rem;
      max-height: 300px;
      overflow-y: auto;

      p {
        margin: 0 0 0.5rem 0;
      }

      pre {
        background: var(--ui-bg-secondary);
        border-radius: 4px;
        padding: 0.5rem;
        margin: 0 0 0.75rem 0;
        overflow-x: auto;

        code {
          font-size: 0.75rem;
          font-family: monospace;
          white-space: pre;
        }
      }

      .usage-note {
        font-size: 0.75rem;
        color: var(--ui-text-muted);

        code {
          background: var(--ui-bg-secondary);
          padding: 0.125rem 0.25rem;
          border-radius: 3px;
          font-size: 0.6875rem;
        }
      }

      .resolution-list {
        margin: 0.25rem 0 0.75rem 1.25rem;
        font-size: 0.75rem;

        li {
          margin-bottom: 0.25rem;
        }

        code {
          background: var(--ui-bg-secondary);
          padding: 0.125rem 0.25rem;
          border-radius: 3px;
          font-size: 0.6875rem;
        }
      }
    }

    .collection-id-list {
      border: 1px solid var(--ui-border);
      border-radius: 4px;
    }

    .collection-id-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }
    }

    .collection-id-name {
      font-weight: 500;
      font-size: 0.8125rem;
    }

    .collection-id-value {
      font-size: 0.6875rem;
      font-family: monospace;
      background: var(--ui-bg-secondary);
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      cursor: pointer;

      &:hover {
        background: var(--ui-bg-tertiary, var(--ui-bg-secondary));
        color: var(--ui-primary);
      }
    }

    .create-key-section {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
      margin-bottom: 1rem;
    }

    .new-key-banner {
      background: var(--ui-warning-bg, #fef3c7);
      border: 1px solid var(--ui-warning-border, #f59e0b);
      border-radius: 6px;
      padding: 0.75rem;
      margin-bottom: 1rem;
    }

    .new-key-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--ui-warning-text, #92400e);
      margin-bottom: 0.5rem;
    }

    .new-key-value {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--ui-bg);
      border-radius: 4px;
      padding: 0.5rem;

      code {
        flex: 1;
        font-size: 0.75rem;
        word-break: break-all;
        font-family: monospace;
      }
    }

    .api-keys-list {
      border: 1px solid var(--ui-border);
      border-radius: 6px;
    }

    .api-key-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }
    }

    .api-key-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .api-key-name {
      font-weight: 500;
      font-size: 0.875rem;
    }

    .api-key-meta {
      display: flex;
      gap: 0.75rem;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .api-key-prefix {
      font-family: monospace;
      background: var(--ui-bg-secondary);
      padding: 0.125rem 0.25rem;
      border-radius: 3px;
    }

    .api-key-expires.expired {
      color: var(--ui-danger);
    }

    .loading-state,
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: var(--ui-text-muted);
    }

    .error-message {
      color: var(--ui-danger);
      font-size: 0.8125rem;
      margin-top: 0.5rem;
    }
  `]
})
export class ManageWorkspaceDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as ManageWorkspaceDialogData;
  private workspaceService = inject(CloudWorkspaceService);
  private toastService = inject(ToastService);

  apiKeys = signal<WorkspaceApiKey[]>([]);
  collections = this.workspaceService.collections;
  isLoading = signal(false);
  isCreating = signal(false);
  newKeyName = signal('');
  newKeyExpires = signal('');
  newlyCreatedKey = signal<string | null>(null);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadApiKeys();
  }

  async loadApiKeys(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const keys = await this.workspaceService.getApiKeys(this.data.workspace.id);
      this.apiKeys.set(keys);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      this.isLoading.set(false);
    }
  }

  async createApiKey(): Promise<void> {
    const name = this.newKeyName().trim();
    if (!name || this.isCreating()) return;

    this.isCreating.set(true);
    this.error.set(null);
    this.newlyCreatedKey.set(null);

    try {
      let expiresAt: string | undefined;
      const expiresInput = this.newKeyExpires().trim();
      if (expiresInput) {
        const date = new Date(expiresInput);
        if (isNaN(date.getTime())) {
          this.error.set('Invalid date format. Use YYYY-MM-DD');
          this.isCreating.set(false);
          return;
        }
        expiresAt = date.toISOString();
      }

      const created = await this.workspaceService.createApiKey(
        this.data.workspace.id,
        name,
        expiresAt
      );

      this.newlyCreatedKey.set(created.key);
      this.newKeyName.set('');
      this.newKeyExpires.set('');

      // Add to list (without the full key)
      const { key, ...keyWithoutSecret } = created;
      this.apiKeys.update(keys => [keyWithoutSecret, ...keys]);

      this.toastService.success('API key created');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      this.isCreating.set(false);
    }
  }

  async revokeKey(key: WorkspaceApiKey): Promise<void> {
    if (!confirm(`Are you sure you want to revoke "${key.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await this.workspaceService.revokeApiKey(this.data.workspace.id, key.id);
      this.apiKeys.update(keys => keys.filter(k => k.id !== key.id));
      this.toastService.success('API key revoked');
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  }

  copyKey(): void {
    const key = this.newlyCreatedKey();
    if (key) {
      navigator.clipboard.writeText(key);
      this.toastService.success('API key copied to clipboard');
    }
  }

  copyCollectionId(id: string): void {
    navigator.clipboard.writeText(id);
    this.toastService.success('Collection ID copied to clipboard');
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  isExpired(dateStr: string): boolean {
    return new Date(dateStr) < new Date();
  }

  close(): void {
    this.dialogRef.close();
  }
}

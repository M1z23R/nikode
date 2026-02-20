import { Component, inject, model, signal, computed, OnInit } from '@angular/core';
import { TAB_DATA, ButtonComponent, InputComponent, ToastService } from '@m1z23r/ngx-ui';
import { VaultService } from '../../core/services/vault.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { DecryptedVaultItem } from '../../core/models/cloud.model';

export interface VaultTabData {
  workspaceId: string;
}

@Component({
  selector: 'app-vault-tab-content',
  imports: [ButtonComponent, InputComponent],
  template: `
    <div class="vault-container">
      @if (vaultService.isLoading()) {
        <div class="vault-state">
          <p class="vault-message">Loading vault...</p>
        </div>
      } @else if (!vaultService.vaultExists()) {
        <!-- No vault state -->
        @if (isOwner()) {
          <div class="vault-state">
            <svg class="vault-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p class="vault-message">No vault yet. Create one to store encrypted secrets.</p>
            <div class="vault-form">
              <ui-input
                type="password"
                placeholder="Password"
                [(value)]="createPassword"
              />
              <ui-input
                type="password"
                placeholder="Confirm password"
                [(value)]="createConfirmPassword"
              />
              <ui-button
                variant="default"
                color="primary"
                [disabled]="!canCreate()"
                (clicked)="onCreateVault()"
              >Create Vault</ui-button>
            </div>
          </div>
        } @else {
          <div class="vault-state">
            <svg class="vault-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <p class="vault-message">No vault has been created for this workspace yet.</p>
          </div>
        }
      } @else if (!vaultService.isUnlocked()) {
        <!-- Locked state -->
        <div class="vault-state">
          <svg class="vault-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <p class="vault-message">Vault is locked. Enter your password to unlock.</p>
          <div class="vault-form">
            <ui-input
              type="password"
              placeholder="Password"
              [(value)]="unlockPassword"
              (keydown.enter)="onUnlock()"
            />
            @if (unlockError()) {
              <p class="error-text">{{ unlockError() }}</p>
            }
            <ui-button
              variant="default"
              color="primary"
              [disabled]="!unlockPassword()"
              (clicked)="onUnlock()"
            >Unlock</ui-button>
          </div>
        </div>
      } @else {
        <!-- Unlocked state -->
        <div class="vault-header">
          <div class="vault-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Vault</span>
          </div>
          <div class="vault-actions">
            @if (isOwner()) {
              <ui-button variant="ghost" color="danger" size="sm" (clicked)="onDeleteVault()">Delete Vault</ui-button>
            }
            <ui-button variant="outline" size="sm" (clicked)="onLock()">Lock</ui-button>
          </div>
        </div>

        @if (isOwner()) {
          <div class="add-entry-row">
            <ui-input
              placeholder="Name"
              [(value)]="newName"
            />
            <ui-input
              placeholder="Value"
              [(value)]="newValue"
              (keydown.enter)="onAddItem()"
            />
            <ui-button
              variant="default"
              color="primary"
              size="sm"
              [disabled]="!newName() || !newValue()"
              (clicked)="onAddItem()"
            >Add</ui-button>
          </div>
        }

        <div class="entries-list">
          @for (item of vaultService.items(); track item.id) {
            <div class="entry-row">
              @if (editingItemId() === item.id) {
                <!-- Edit mode -->
                <ui-input
                  class="entry-name"
                  [(value)]="editName"
                />
                <ui-input
                  class="entry-value"
                  [(value)]="editValue"
                  (keydown.enter)="onSaveEdit(item.id)"
                />
                <div class="entry-actions">
                  <ui-button variant="ghost" size="sm" (clicked)="onSaveEdit(item.id)">Save</ui-button>
                  <ui-button variant="ghost" size="sm" (clicked)="onCancelEdit()">Cancel</ui-button>
                </div>
              } @else {
                <!-- View mode -->
                <span class="entry-name">{{ item.name }}</span>
                <span class="entry-value monospace">
                  @if (revealedIds().has(item.id)) {
                    {{ item.value }}
                  } @else {
                    {{ maskedValue(item.value) }}
                  }
                </span>
                <div class="entry-actions">
                  <ui-button variant="ghost" size="sm" (clicked)="onCopyValue(item)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </ui-button>
                  <ui-button variant="ghost" size="sm" (clicked)="toggleReveal(item.id)">
                    @if (revealedIds().has(item.id)) {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    } @else {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    }
                  </ui-button>
                  @if (isOwner()) {
                    <ui-button variant="ghost" size="sm" (clicked)="onStartEdit(item)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </ui-button>
                    <ui-button variant="ghost" size="sm" (clicked)="onDeleteItem(item.id)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </ui-button>
                  }
                </div>
              }
            </div>
          } @empty {
            <div class="empty-state">
              <p>No items in the vault yet.</p>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .vault-container {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      gap: 1rem;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
    }

    .vault-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      flex: 1;
    }

    .vault-icon {
      color: var(--ui-text-muted);
    }

    .vault-message {
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }

    .vault-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: 100%;
      max-width: 320px;
    }

    .error-text {
      color: var(--ui-danger);
      font-size: 0.75rem;
      margin: 0;
    }

    .vault-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .vault-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 1rem;
    }

    .vault-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .add-entry-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-shrink: 0;

      ui-input {
        flex: 1;
      }
    }

    .entries-list {
      display: flex;
      flex-direction: column;
      gap: 0;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .entry-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background-color: var(--ui-bg-secondary);
      }
    }

    .entry-name {
      min-width: 140px;
      max-width: 200px;
      font-weight: 500;
      font-size: 0.8125rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entry-value {
      flex: 1;
      font-size: 0.8125rem;
      color: var(--ui-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .monospace {
      font-family: var(--ui-font-mono, monospace);
    }

    .entry-actions {
      display: flex;
      align-items: center;
      gap: 0.125rem;
      flex-shrink: 0;
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: var(--ui-text-muted);
      font-size: 0.8125rem;
    }
  `]
})
export class VaultTabContentComponent implements OnInit {
  private readonly data = inject(TAB_DATA) as VaultTabData;
  readonly vaultService = inject(VaultService);
  private readonly cloudWorkspaceService = inject(CloudWorkspaceService);
  private readonly toastService = inject(ToastService);

  // Create vault form
  createPassword = model('');
  createConfirmPassword = model('');

  // Unlock form
  unlockPassword = model('');
  unlockError = signal('');

  // Add item form
  newName = model('');
  newValue = model('');

  // Edit state
  editingItemId = signal<string | null>(null);
  editName = model('');
  editValue = model('');

  // Reveal state
  revealedIds = signal<Set<string>>(new Set());

  readonly isOwner = computed(() =>
    this.cloudWorkspaceService.activeWorkspace()?.role === 'owner'
  );

  readonly canCreate = computed(() => {
    const pw = this.createPassword();
    const cpw = this.createConfirmPassword();
    return pw.length > 0 && pw === cpw;
  });

  ngOnInit(): void {
    this.vaultService.loadVault(this.data.workspaceId).catch(e => {
      this.toastService.error(e?.message ?? 'Failed to load vault');
    });
  }

  async onCreateVault(): Promise<void> {
    if (!this.canCreate()) return;
    try {
      await this.vaultService.createVault(this.data.workspaceId, this.createPassword());
      this.createPassword.set('');
      this.createConfirmPassword.set('');
      this.toastService.success('Vault created');
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to create vault');
    }
  }

  async onUnlock(): Promise<void> {
    if (!this.unlockPassword()) return;
    this.unlockError.set('');
    try {
      await this.vaultService.unlockVault(this.data.workspaceId, this.unlockPassword());
      this.unlockPassword.set('');
    } catch (e: any) {
      this.unlockError.set(e?.message ?? 'Failed to unlock vault');
    }
  }

  onLock(): void {
    this.vaultService.lockVault();
    this.revealedIds.set(new Set());
  }

  async onDeleteVault(): Promise<void> {
    try {
      await this.vaultService.deleteVault(this.data.workspaceId);
      this.toastService.success('Vault deleted');
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to delete vault');
    }
  }

  async onAddItem(): Promise<void> {
    const name = this.newName();
    const value = this.newValue();
    if (!name || !value) return;
    try {
      await this.vaultService.addItem(this.data.workspaceId, name, value);
      this.newName.set('');
      this.newValue.set('');
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to add item');
    }
  }

  onStartEdit(item: DecryptedVaultItem): void {
    this.editingItemId.set(item.id);
    this.editName.set(item.name);
    this.editValue.set(item.value);
  }

  onCancelEdit(): void {
    this.editingItemId.set(null);
    this.editName.set('');
    this.editValue.set('');
  }

  async onSaveEdit(itemId: string): Promise<void> {
    try {
      await this.vaultService.updateItem(this.data.workspaceId, itemId, this.editName(), this.editValue());
      this.editingItemId.set(null);
      this.editName.set('');
      this.editValue.set('');
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to update item');
    }
  }

  async onDeleteItem(itemId: string): Promise<void> {
    try {
      await this.vaultService.deleteItem(this.data.workspaceId, itemId);
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to delete item');
    }
  }

  async onCopyValue(item: DecryptedVaultItem): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.value);
      this.toastService.success('Copied to clipboard');
    } catch {
      this.toastService.error('Failed to copy to clipboard');
    }
  }

  toggleReveal(itemId: string): void {
    this.revealedIds.update(set => {
      const next = new Set(set);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  maskedValue(value: string): string {
    return '\u2022'.repeat(Math.min(value.length, 24));
  }
}

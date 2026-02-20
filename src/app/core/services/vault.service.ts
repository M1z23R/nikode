import { Injectable, inject, signal, effect } from '@angular/core';
import { TabsService, ToastService } from '@m1z23r/ngx-ui';
import { ApiClientService, ApiError } from './api-client.service';
import { AuthService } from './auth.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { VaultMeta, VaultItem, DecryptedVaultItem } from '../models/cloud.model';
import { VaultTabContentComponent, VaultTabData } from '../../features/vault/vault-tab-content.component';

const VERIFICATION_PLAINTEXT = 'verification-check';
const PBKDF2_ITERATIONS = 600_000;

@Injectable({ providedIn: 'root' })
export class VaultService {
  private apiClient = inject(ApiClientService);
  private authService = inject(AuthService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private tabsService = inject(TabsService);
  private toastService = inject(ToastService);

  readonly vaultMeta = signal<VaultMeta | null>(null);
  readonly vaultExists = signal<boolean>(false);
  readonly isUnlocked = signal<boolean>(false);
  readonly items = signal<DecryptedVaultItem[]>([]);
  readonly isLoading = signal<boolean>(false);

  private derivedKey: CryptoKey | null = null;

  constructor() {
    this.authService.onLogout(() => this.clear());

    // Auto-lock when workspace changes
    effect(() => {
      this.cloudWorkspaceService.activeWorkspace();
      // Lock vault whenever workspace changes
      this.lockVault();
    });
  }

  // --- Crypto methods ---

  private generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async encrypt(key: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  private async decrypt(key: CryptoKey, blob: string): Promise<string> {
    const combined = new Uint8Array(this.base64ToArrayBuffer(blob));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plaintextBytes);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // --- Vault lifecycle ---

  async loadVault(workspaceId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const meta = await this.apiClient.get<VaultMeta>(`/workspaces/${workspaceId}/vault`);
      this.vaultMeta.set(meta);
      this.vaultExists.set(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        this.vaultMeta.set(null);
        this.vaultExists.set(false);
      } else {
        throw e;
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async createVault(workspaceId: string, password: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const salt = this.generateSalt();
      const key = await this.deriveKey(password, salt);
      const verification = await this.encrypt(key, VERIFICATION_PLAINTEXT);
      const saltBase64 = this.arrayBufferToBase64(salt.buffer as ArrayBuffer);

      const meta = await this.apiClient.post<VaultMeta>(`/workspaces/${workspaceId}/vault`, {
        salt: saltBase64,
        verification,
      });

      this.vaultMeta.set(meta);
      this.vaultExists.set(true);
      this.derivedKey = key;
      this.isUnlocked.set(true);
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteVault(workspaceId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.apiClient.delete(`/workspaces/${workspaceId}/vault`);
      this.clear();
    } finally {
      this.isLoading.set(false);
    }
  }

  async unlockVault(workspaceId: string, password: string): Promise<void> {
    const meta = this.vaultMeta();
    if (!meta) throw new Error('No vault to unlock');

    this.isLoading.set(true);
    try {
      const salt = new Uint8Array(this.base64ToArrayBuffer(meta.salt));
      const key = await this.deriveKey(password, salt);

      // Verify password
      let decrypted: string;
      try {
        decrypted = await this.decrypt(key, meta.verification);
      } catch {
        throw new Error('Wrong password');
      }

      if (decrypted !== VERIFICATION_PLAINTEXT) {
        throw new Error('Wrong password');
      }

      this.derivedKey = key;
      this.isUnlocked.set(true);

      // Load and decrypt items
      await this.loadItems(workspaceId);
    } finally {
      this.isLoading.set(false);
    }
  }

  lockVault(): void {
    this.derivedKey = null;
    this.items.set([]);
    this.isUnlocked.set(false);
  }

  // --- Item CRUD ---

  private async loadItems(workspaceId: string): Promise<void> {
    if (!this.derivedKey) return;

    const encryptedItems = await this.apiClient.get<VaultItem[]>(`/workspaces/${workspaceId}/vault/items`);
    const decrypted: DecryptedVaultItem[] = [];

    for (const item of encryptedItems) {
      try {
        const json = await this.decrypt(this.derivedKey, item.data);
        const parsed = JSON.parse(json);
        decrypted.push({ id: item.id, name: parsed.name, value: parsed.value });
      } catch {
        decrypted.push({ id: item.id, name: '[Decryption failed]', value: '' });
      }
    }

    this.items.set(decrypted);
  }

  async addItem(workspaceId: string, name: string, value: string): Promise<void> {
    if (!this.derivedKey) throw new Error('Vault is locked');

    const data = await this.encrypt(this.derivedKey, JSON.stringify({ name, value }));
    const created = await this.apiClient.post<VaultItem>(`/workspaces/${workspaceId}/vault/items`, { data });

    this.items.update(items => [...items, { id: created.id, name, value }]);
  }

  async updateItem(workspaceId: string, itemId: string, name: string, value: string): Promise<void> {
    if (!this.derivedKey) throw new Error('Vault is locked');

    const data = await this.encrypt(this.derivedKey, JSON.stringify({ name, value }));
    await this.apiClient.patch(`/workspaces/${workspaceId}/vault/items/${itemId}`, { data });

    this.items.update(items =>
      items.map(i => i.id === itemId ? { id: itemId, name, value } : i)
    );
  }

  async deleteItem(workspaceId: string, itemId: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${workspaceId}/vault/items/${itemId}`);
    this.items.update(items => items.filter(i => i.id !== itemId));
  }

  // --- Tab management ---

  openVaultTab(workspaceId: string): void {
    const tabId = `vault:${workspaceId}`;

    if (this.tabsService.getTab(tabId)) {
      this.tabsService.activateById(tabId);
      return;
    }

    const tabRef = this.tabsService.open<VaultTabContentComponent, VaultTabData, void>(
      VaultTabContentComponent,
      {
        id: tabId,
        label: 'Vault',
        data: { workspaceId },
        closable: true,
        activate: true,
      }
    );

    tabRef.afterClosed().then(() => {
      this.lockVault();
    });
  }

  // --- Cleanup ---

  private clear(): void {
    this.derivedKey = null;
    this.vaultMeta.set(null);
    this.vaultExists.set(false);
    this.isUnlocked.set(false);
    this.items.set([]);
  }
}

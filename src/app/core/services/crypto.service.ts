import { Injectable } from '@angular/core';

const DB_NAME = 'nikode-crypto';
const DB_VERSION = 1;
const KEY_STORE = 'keys';

interface StoredKeyPair {
  id: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

interface StoredWorkspaceKey {
  id: string;
  key: JsonWebKey;
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private db: IDBDatabase | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private workspaceKeys = new Map<string, CryptoKey>();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    await this.openDatabase();
    await this.loadOrGenerateKeyPair();
    await this.loadWorkspaceKeys();
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[Crypto] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(KEY_STORE)) {
          db.createObjectStore(KEY_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  private async loadOrGenerateKeyPair(): Promise<void> {
    const stored = await this.getFromStore<StoredKeyPair>('user-keypair');

    if (stored) {
      try {
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          stored.publicKey,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );
        const privateKey = await crypto.subtle.importKey(
          'jwk',
          stored.privateKey,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['decrypt']
        );
        this.keyPair = { publicKey, privateKey };
        return;
      } catch (err) {
        console.warn('[Crypto] Failed to load stored key pair, generating new one:', err);
      }
    }

    // Generate new RSA-2048 key pair
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Store the key pair
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.privateKey);

    await this.saveToStore({
      id: 'user-keypair',
      publicKey: publicKeyJwk,
      privateKey: privateKeyJwk,
    });
  }

  private async loadWorkspaceKeys(): Promise<void> {
    const allKeys = await this.getAllFromStore<StoredWorkspaceKey>();

    for (const stored of allKeys) {
      if (stored.id.startsWith('workspace-key-')) {
        try {
          const workspaceId = stored.id.replace('workspace-key-', '');
          const key = await crypto.subtle.importKey(
            'jwk',
            stored.key,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          this.workspaceKeys.set(workspaceId, key);
        } catch (err) {
          console.warn(`[Crypto] Failed to load workspace key ${stored.id}:`, err);
        }
      }
    }
  }

  /** Get the public key as base64 for sending to server */
  async getPublicKeyBase64(): Promise<string> {
    await this.ensureInitialized();
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    const exported = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    return this.arrayBufferToBase64(exported);
  }

  /** Generate a new AES-256 key for a workspace */
  async generateWorkspaceKey(workspaceId: string): Promise<void> {
    await this.ensureInitialized();

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.workspaceKeys.set(workspaceId, key);
    await this.saveWorkspaceKey(workspaceId, key);
  }

  /** Check if we have a workspace key */
  hasWorkspaceKey(workspaceId: string): boolean {
    return this.workspaceKeys.has(workspaceId);
  }

  /** Get the workspace key encrypted with a recipient's public key (for sharing) */
  async getEncryptedWorkspaceKey(workspaceId: string, recipientPublicKeyBase64: string): Promise<string> {
    await this.ensureInitialized();

    const workspaceKey = this.workspaceKeys.get(workspaceId);
    if (!workspaceKey) {
      throw new Error(`No workspace key found for ${workspaceId}`);
    }

    // Import recipient's public key
    const publicKeyBytes = this.base64ToArrayBuffer(recipientPublicKeyBase64);
    const recipientPublicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    // Export workspace key as raw bytes
    const rawKey = await crypto.subtle.exportKey('raw', workspaceKey);

    // Encrypt with recipient's public key
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      recipientPublicKey,
      rawKey
    );

    return this.arrayBufferToBase64(encrypted);
  }

  /** Import a workspace key received from another member */
  async importWorkspaceKey(workspaceId: string, encryptedKeyBase64: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    // Decrypt the workspace key with our private key
    const encryptedKey = this.base64ToArrayBuffer(encryptedKeyBase64);
    const decryptedKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      this.keyPair.privateKey,
      encryptedKey
    );

    // Import the decrypted key as AES-GCM
    const key = await crypto.subtle.importKey(
      'raw',
      decryptedKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.workspaceKeys.set(workspaceId, key);
    await this.saveWorkspaceKey(workspaceId, key);
  }

  /** Encrypt a message with the workspace key */
  async encryptMessage(workspaceId: string, plaintext: string): Promise<string> {
    await this.ensureInitialized();

    const key = this.workspaceKeys.get(workspaceId);
    if (!key) {
      throw new Error(`No workspace key found for ${workspaceId}`);
    }

    // Generate random IV (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encode plaintext as UTF-8
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintextBytes
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  /** Decrypt a message with the workspace key */
  async decryptMessage(workspaceId: string, ciphertextBase64: string): Promise<string> {
    await this.ensureInitialized();

    const key = this.workspaceKeys.get(workspaceId);
    if (!key) {
      throw new Error(`No workspace key found for ${workspaceId}`);
    }

    // Decode base64
    const combined = new Uint8Array(this.base64ToArrayBuffer(ciphertextBase64));

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt
    const plaintextBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    // Decode UTF-8
    const decoder = new TextDecoder();
    return decoder.decode(plaintextBytes);
  }

  /** Clear workspace key (when leaving workspace) */
  async clearWorkspaceKey(workspaceId: string): Promise<void> {
    this.workspaceKeys.delete(workspaceId);
    await this.deleteFromStore(`workspace-key-${workspaceId}`);
  }

  /** Clear all keys (on logout) */
  async clearAllKeys(): Promise<void> {
    this.workspaceKeys.clear();
    // Keep the user's key pair, only clear workspace keys
    const allKeys = await this.getAllFromStore<StoredWorkspaceKey>();
    for (const key of allKeys) {
      if (key.id.startsWith('workspace-key-')) {
        await this.deleteFromStore(key.id);
      }
    }
  }

  // --- IndexedDB helpers ---

  private async saveWorkspaceKey(workspaceId: string, key: CryptoKey): Promise<void> {
    const keyJwk = await crypto.subtle.exportKey('jwk', key);
    await this.saveToStore({
      id: `workspace-key-${workspaceId}`,
      key: keyJwk,
    });
  }

  private getFromStore<T>(id: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(undefined);
        return;
      }
      const tx = this.db.transaction(KEY_STORE, 'readonly');
      const store = tx.objectStore(KEY_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private getAllFromStore<T>(): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }
      const tx = this.db.transaction(KEY_STORE, 'readonly');
      const store = tx.objectStore(KEY_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  private saveToStore(data: { id: string; [key: string]: unknown }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(KEY_STORE, 'readwrite');
      const store = tx.objectStore(KEY_STORE);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private deleteFromStore(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      const tx = this.db.transaction(KEY_STORE, 'readwrite');
      const store = tx.objectStore(KEY_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Encoding helpers ---

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
}

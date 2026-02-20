import { Injectable, inject, signal, computed, OnDestroy, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { RealtimeService } from './realtime.service';
import { CryptoService } from './crypto.service';
import { ChatMessage, PublicKeyInfo, KeyExchangeRequest, WorkspaceKeyData } from '../models/chat.model';

const MAX_MESSAGE_LENGTH = 4000;
const HISTORY_LIMIT = 50;

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private authService = inject(AuthService);
  private cloudWorkspace = inject(CloudWorkspaceService);
  private realtimeService = inject(RealtimeService);
  private cryptoService = inject(CryptoService);

  private publicKeySet = false;
  private unregisterHandlers: (() => void)[] = [];
  private unregisterConnect: (() => void) | null = null;

  private _messages = signal<Map<string, ChatMessage[]>>(new Map());
  private _pendingKeyRequests = signal<Set<string>>(new Set());
  private _hasWorkspaceKey = signal<Map<string, boolean>>(new Map());
  private _unreadCount = signal<Map<string, number>>(new Map());
  private _viewingWorkspaceId = signal<string | null>(null);

  readonly messages = this._messages.asReadonly();
  readonly pendingKeyRequests = this._pendingKeyRequests.asReadonly();
  readonly hasWorkspaceKey = this._hasWorkspaceKey.asReadonly();
  readonly unreadCount = this._unreadCount.asReadonly();
  readonly isConnected = this.realtimeService.isConnected;

  constructor() {
    this.registerMessageHandlers();

    // Set public key when connected
    this.unregisterConnect = this.realtimeService.onConnect(() => {
      this.setPublicKey();
    });

    // Clear state on logout
    this.authService.onLogout(() => {
      this.clearState();
      this.cryptoService.clearAllKeys();
    });

    // Auto-update workspace key status when workspace changes
    effect(() => {
      const workspace = this.cloudWorkspace.activeWorkspace();
      if (workspace) {
        this.updateWorkspaceKeyStatus(workspace.id);
      }
    });
  }

  ngOnDestroy(): void {
    for (const unregister of this.unregisterHandlers) {
      unregister();
    }
    if (this.unregisterConnect) {
      this.unregisterConnect();
    }
  }

  private registerMessageHandlers(): void {
    // Register handlers for chat-related message types
    this.unregisterHandlers.push(
      this.realtimeService.registerHandler('public_key_set', () => {
        this.publicKeySet = true;
      }),
      this.realtimeService.registerHandler('subscribed', (message) => {
        this.updateWorkspaceKeyStatus(message.workspace_id);
        this.requestHistory(message.workspace_id);
      }),
      this.realtimeService.registerHandler('workspace_keys', (message) => {
        this.handleWorkspaceKeys(message.workspace_id, message.data.members);
      }),
      this.realtimeService.registerHandler('key_exchange_needed', (message) => {
        this.handleKeyExchangeNeeded(message.workspace_id, message.data);
      }),
      this.realtimeService.registerHandler('workspace_key', (message) => {
        this.handleWorkspaceKey(message.workspace_id, message.data);
      }),
      this.realtimeService.registerHandler('chat_message', (message) => {
        this.handleChatMessage(message.workspace_id, message.data);
      }),
      this.realtimeService.registerHandler('chat_history', (message) => {
        this.handleChatHistory(message.workspace_id, message.messages);
      }),
      this.realtimeService.registerHandler('chat_sent', () => {
        // Message sent confirmation - can be used for optimistic UI updates
      })
    );
  }

  /** Get messages for a specific workspace */
  getMessages(workspaceId: string): ChatMessage[] {
    return this._messages().get(workspaceId) ?? [];
  }

  /** Get unread count for a specific workspace */
  getUnreadCount(workspaceId: string): number {
    return this._unreadCount().get(workspaceId) ?? 0;
  }

  /** Clear unread count for a workspace */
  clearUnreadCount(workspaceId: string): void {
    this._unreadCount.update(m => {
      const n = new Map(m);
      n.set(workspaceId, 0);
      return n;
    });
  }

  /** Mark a workspace chat as being actively viewed (prevents unread count increment) */
  setViewingWorkspace(workspaceId: string | null): void {
    this._viewingWorkspaceId.set(workspaceId);
    if (workspaceId) {
      this.clearUnreadCount(workspaceId);
    }
  }

  /** Check if workspace has an encryption key */
  workspaceHasKey(workspaceId: string): boolean {
    return this._hasWorkspaceKey().get(workspaceId) ?? false;
  }

  /** Send a chat message (will be encrypted) */
  async sendMessage(workspaceId: string, content: string): Promise<void> {
    if (!content.trim()) return;

    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
    }

    // Encrypt the message
    const encryptedContent = await this.cryptoService.encryptMessage(workspaceId, content);

    this.realtimeService.sendMessage({
      action: 'send_chat',
      workspace_id: workspaceId,
      content: encryptedContent,
      encrypted: true,
    });
  }

  /** Request chat history for a workspace */
  requestHistory(workspaceId: string, limit: number = HISTORY_LIMIT): void {
    this.realtimeService.sendMessage({
      action: 'get_chat_history',
      workspace_id: workspaceId,
      limit,
    });
  }

  private async setPublicKey(): Promise<void> {
    try {
      await this.cryptoService.ensureInitialized();
      const publicKey = await this.cryptoService.getPublicKeyBase64();
      this.realtimeService.sendMessage({ action: 'set_public_key', public_key: publicKey });
    } catch (err) {
      console.error('[Chat] Failed to set public key:', err);
    }
  }

  private async handleWorkspaceKeys(workspaceId: string, members: PublicKeyInfo[]): Promise<void> {
    const hasKey = this.cryptoService.hasWorkspaceKey(workspaceId);

    if (members.length === 0) {
      // We're the first user - generate a new workspace key
      await this.cryptoService.generateWorkspaceKey(workspaceId);
      this.updateWorkspaceKeyStatus(workspaceId);
    } else if (!hasKey) {
      // Wait for someone to share the key with us
      this._pendingKeyRequests.update(s => new Set(s).add(workspaceId));
    } else {
      // We already have the key
      this.updateWorkspaceKeyStatus(workspaceId);
    }
  }

  private async handleKeyExchangeNeeded(workspaceId: string, data: KeyExchangeRequest): Promise<void> {
    // A new user joined and needs the workspace key
    const hasKey = this.cryptoService.hasWorkspaceKey(workspaceId);
    if (!hasKey) return;

    try {
      const encryptedKey = await this.cryptoService.getEncryptedWorkspaceKey(
        workspaceId,
        data.public_key
      );

      this.realtimeService.sendMessage({
        action: 'share_workspace_key',
        workspace_id: workspaceId,
        target_user_id: data.user_id,
        encrypted_key: encryptedKey,
      });
    } catch (err) {
      console.error('[Chat] Failed to share workspace key:', err);
    }
  }

  private async handleWorkspaceKey(workspaceId: string, data: WorkspaceKeyData): Promise<void> {
    try {
      await this.cryptoService.importWorkspaceKey(workspaceId, data.encrypted_key);
      this._pendingKeyRequests.update(s => {
        const n = new Set(s);
        n.delete(workspaceId);
        return n;
      });
      this.updateWorkspaceKeyStatus(workspaceId);

      // Re-decrypt any existing messages
      await this.redecryptMessages(workspaceId);
    } catch (err) {
      console.error('[Chat] Failed to import workspace key:', err);
    }
  }

  private async handleChatMessage(workspaceId: string, data: ChatMessage): Promise<void> {
    const message = await this.decryptMessageContent(workspaceId, data);

    this._messages.update(m => {
      const n = new Map(m);
      const messages = [...(n.get(workspaceId) ?? []), message];
      // Keep only last 100 messages
      if (messages.length > 100) {
        messages.shift();
      }
      n.set(workspaceId, messages);
      return n;
    });

    // Increment unread count if not from current user and not currently viewing this workspace's chat
    const currentUserId = this.authService.user()?.id;
    const isViewingThisWorkspace = this._viewingWorkspaceId() === workspaceId;
    if (data.sender_id !== currentUserId && !isViewingThisWorkspace) {
      this._unreadCount.update(m => {
        const n = new Map(m);
        n.set(workspaceId, (n.get(workspaceId) ?? 0) + 1);
        return n;
      });
    }
  }

  private async handleChatHistory(workspaceId: string, messages: ChatMessage[]): Promise<void> {
    const decryptedMessages = await Promise.all(
      messages.map(msg => this.decryptMessageContent(workspaceId, msg))
    );

    this._messages.update(m => {
      const n = new Map(m);
      n.set(workspaceId, decryptedMessages);
      return n;
    });
  }

  private async decryptMessageContent(workspaceId: string, message: ChatMessage): Promise<ChatMessage> {
    if (!message.encrypted) {
      return { ...message, decrypted: true };
    }

    const hasKey = this.cryptoService.hasWorkspaceKey(workspaceId);
    if (!hasKey) {
      return { ...message, decrypted: false, decryptError: 'No encryption key' };
    }

    try {
      const decryptedContent = await this.cryptoService.decryptMessage(workspaceId, message.content);
      return { ...message, content: decryptedContent, decrypted: true };
    } catch (err) {
      console.warn('[Chat] Failed to decrypt message:', err);
      return { ...message, decrypted: false, decryptError: 'Decryption failed' };
    }
  }

  private async redecryptMessages(workspaceId: string): Promise<void> {
    const currentMessages = this._messages().get(workspaceId) ?? [];
    const redecrypted = await Promise.all(
      currentMessages.map(msg => {
        if (msg.decryptError) {
          return this.decryptMessageContent(workspaceId, msg);
        }
        return msg;
      })
    );

    this._messages.update(m => {
      const n = new Map(m);
      n.set(workspaceId, redecrypted);
      return n;
    });
  }

  private updateWorkspaceKeyStatus(workspaceId: string): void {
    const hasKey = this.cryptoService.hasWorkspaceKey(workspaceId);
    this._hasWorkspaceKey.update(m => {
      const n = new Map(m);
      n.set(workspaceId, hasKey);
      return n;
    });
  }

  private clearState(): void {
    this.publicKeySet = false;
    this._messages.set(new Map());
    this._pendingKeyRequests.set(new Set());
    this._hasWorkspaceKey.set(new Map());
    this._unreadCount.set(new Map());
  }
}

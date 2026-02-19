export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  avatar_url?: string;
  content: string;          // Encrypted ciphertext (base64) or decrypted plaintext
  encrypted: boolean;
  timestamp: string;        // ISO 8601
  // Frontend-only properties
  decrypted?: boolean;      // Whether content has been decrypted
  decryptError?: string;    // Error message if decryption failed
}

export interface PublicKeyInfo {
  user_id: string;
  user_name: string;
  public_key: string;       // Base64-encoded public key
}

export interface KeyExchangeRequest {
  user_id: string;
  user_name: string;
  public_key: string;
}

export interface WorkspaceKeyData {
  from_user_id: string;
  encrypted_key: string;    // AES key encrypted with recipient's public key
}

// Client -> Server message types
export interface SetPublicKeyMessage {
  action: 'set_public_key';
  public_key: string;
}

export interface SubscribeMessage {
  action: 'subscribe';
  workspace_id: string;
}

export interface SendChatMessage {
  action: 'send_chat';
  workspace_id: string;
  content: string;          // Encrypted content (base64)
  encrypted: boolean;
}

export interface GetChatHistoryMessage {
  action: 'get_chat_history';
  workspace_id: string;
  limit?: number;
}

export interface ShareWorkspaceKeyMessage {
  action: 'share_workspace_key';
  workspace_id: string;
  target_user_id: string;
  encrypted_key: string;
}

// Chat state
export interface ChatState {
  messages: Map<string, ChatMessage[]>;  // workspaceId -> messages
  pendingKeyRequests: Set<string>;       // workspaceIds waiting for key
  hasWorkspaceKey: Map<string, boolean>; // workspaceId -> has key
}

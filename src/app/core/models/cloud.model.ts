import { Collection } from './collection.model';
import { User } from './auth.model';

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  role: 'owner' | 'member';
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  role: 'owner' | 'member';
  user: User;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  workspace?: Workspace;
  inviter?: User;
  invitee?: User;
}

export interface CloudCollection {
  id: string;
  workspace_id: string;
  name: string;
  data: Collection;
  version: number;
  updated_by: string;
  updated_at?: string;
}

export interface WorkspaceApiKey {
  id: string;
  name: string;
  key_prefix: string;
  expires_at: string | null;
  created_at: string;
}

export interface WorkspaceApiKeyCreated extends WorkspaceApiKey {
  key: string; // Only returned on creation
}

export interface VaultMeta {
  salt: string;           // base64
  verification: string;   // base64 encrypted blob
}

export interface VaultItem {
  id: string;
  data: string;           // base64 encrypted blob
}

// Client-side only (after decryption)
export interface DecryptedVaultItem {
  id: string;
  name: string;
  value: string;
}

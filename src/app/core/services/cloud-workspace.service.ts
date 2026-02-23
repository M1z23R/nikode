import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Workspace, CloudCollection, WorkspaceMember, WorkspaceInvite, WorkspaceApiKey, WorkspaceApiKeyCreated } from '../models/cloud.model';
import { Collection, normalizeCollection } from '../models/collection.model';
import { isIpcError } from '@shared/ipc-types';

const LAST_WORKSPACE_KEY = 'nikode-last-workspace';

@Injectable({ providedIn: 'root' })
export class CloudWorkspaceService {
  private apiClient = inject(ApiClientService);
  private api = inject(ApiService);
  private authService = inject(AuthService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly activeWorkspace = signal<Workspace | null>(null);
  readonly collections = signal<CloudCollection[]>([]);
  readonly pendingInvites = signal<WorkspaceInvite[]>([]);
  readonly isLoading = signal(false);

  constructor() {
    this.authService.onLogin(() => {
      this.loadWorkspaces();
      this.loadPendingInvites();
    });
    this.authService.onLogout(() => this.clear());
  }

  async loadWorkspaces(): Promise<void> {
    this.isLoading.set(true);
    try {
      const workspaces = await this.apiClient.get<Workspace[]>('/workspaces');
      this.workspaces.set(workspaces);

      const lastId = localStorage.getItem(LAST_WORKSPACE_KEY);
      if (lastId && !this.activeWorkspace()) {
        const match = workspaces.find(w => w.id === lastId);
        if (match) {
          await this.selectWorkspace(match);
        }
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async createWorkspace(name: string): Promise<Workspace> {
    const workspace = await this.apiClient.post<Workspace>('/workspaces', { name });
    this.workspaces.update(ws => [...ws, workspace]);
    return workspace;
  }

  async updateWorkspace(id: string, name: string): Promise<Workspace> {
    const workspace = await this.apiClient.patch<Workspace>(`/workspaces/${id}`, { name });
    this.workspaces.update(ws => ws.map(w => w.id === id ? workspace : w));
    if (this.activeWorkspace()?.id === id) {
      this.activeWorkspace.set(workspace);
    }
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${id}`);
    this.workspaces.update(ws => ws.filter(w => w.id !== id));
    if (this.activeWorkspace()?.id === id) {
      this.activeWorkspace.set(null);
      this.collections.set([]);
    }
  }

  async selectWorkspace(workspace: Workspace | null): Promise<void> {
    this.activeWorkspace.set(workspace);
    if (workspace) {
      localStorage.setItem(LAST_WORKSPACE_KEY, workspace.id);
      await this.loadCollections(workspace.id);
    } else {
      localStorage.removeItem(LAST_WORKSPACE_KEY);
      this.collections.set([]);
    }
  }

  // Member management
  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.apiClient.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
  }

  async inviteMember(workspaceId: string, email: string): Promise<void> {
    await this.apiClient.post(`/workspaces/${workspaceId}/members`, { email });
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${workspaceId}/members/${memberId}`);
  }

  async leaveWorkspace(workspaceId: string): Promise<void> {
    await this.apiClient.post(`/workspaces/${workspaceId}/leave`);
    this.workspaces.update(ws => ws.filter(w => w.id !== workspaceId));
    if (this.activeWorkspace()?.id === workspaceId) {
      this.activeWorkspace.set(null);
      this.collections.set([]);
    }
  }

  // Invite management
  async loadPendingInvites(): Promise<void> {
    try {
      const invites = await this.apiClient.get<WorkspaceInvite[]>('/invites');
      this.pendingInvites.set(invites);
    } catch (err) {
      console.error('Failed to load pending invites:', err);
      this.pendingInvites.set([]);
    }
  }

  async getWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    return this.apiClient.get<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`);
  }

  async cancelInvite(workspaceId: string, inviteId: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
  }

  async acceptInvite(inviteId: string): Promise<void> {
    await this.apiClient.post(`/invites/${inviteId}/accept`);
    this.pendingInvites.update(invites => invites.filter(i => i.id !== inviteId));
    await this.loadWorkspaces();
  }

  async declineInvite(inviteId: string): Promise<void> {
    await this.apiClient.post(`/invites/${inviteId}/decline`);
    this.pendingInvites.update(invites => invites.filter(i => i.id !== inviteId));
  }

  // API Key management
  async getApiKeys(workspaceId: string): Promise<WorkspaceApiKey[]> {
    return this.apiClient.get<WorkspaceApiKey[]>(`/workspaces/${workspaceId}/api-keys`);
  }

  async createApiKey(
    workspaceId: string,
    name: string,
    expiresAt?: string
  ): Promise<WorkspaceApiKeyCreated> {
    const body: { name: string; expires_at?: string } = { name };
    if (expiresAt) {
      body.expires_at = expiresAt;
    }
    return this.apiClient.post<WorkspaceApiKeyCreated>(`/workspaces/${workspaceId}/api-keys`, body);
  }

  async revokeApiKey(workspaceId: string, keyId: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${workspaceId}/api-keys/${keyId}`);
  }

  private normalizeCloudCollection(col: CloudCollection): CloudCollection {
    return { ...col, data: normalizeCollection(col.data) };
  }

  // Collection management
  async getCollectionById(workspaceId: string, collectionId: string): Promise<CloudCollection | null> {
    try {
      const col = await this.apiClient.get<CloudCollection>(
        `/workspaces/${workspaceId}/collections/${collectionId}`
      );
      return this.normalizeCloudCollection(col);
    } catch {
      return null;
    }
  }

  async loadCollections(workspaceId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const collections = await this.apiClient.get<CloudCollection[]>(
        `/workspaces/${workspaceId}/collections`
      );
      this.collections.set(collections.map(c => this.normalizeCloudCollection(c)));
    } catch (err) {
      console.error('Failed to load collections:', err);
      this.collections.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createCollection(
    workspaceId: string,
    name: string,
    data: Collection
  ): Promise<CloudCollection> {
    const collection = this.normalizeCloudCollection(
      await this.apiClient.post<CloudCollection>(
        `/workspaces/${workspaceId}/collections`,
        { name, data }
      )
    );
    if (this.activeWorkspace()?.id === workspaceId) {
      this.collections.update(cols => [...cols, collection]);
    }
    return collection;
  }

  async updateCollection(
    workspaceId: string,
    collectionId: string,
    data: Collection,
    version: number
  ): Promise<CloudCollection> {
    const collection = this.normalizeCloudCollection(
      await this.apiClient.patch<CloudCollection>(
        `/workspaces/${workspaceId}/collections/${collectionId}`,
        { data, version }
      )
    );
    if (this.activeWorkspace()?.id === workspaceId) {
      this.collections.update(cols =>
        cols.map(c => c.id === collectionId ? collection : c)
      );
    }
    return collection;
  }

  async deleteCollection(workspaceId: string, collectionId: string): Promise<void> {
    await this.apiClient.delete(`/workspaces/${workspaceId}/collections/${collectionId}`);
    if (this.activeWorkspace()?.id === workspaceId) {
      this.collections.update(cols => cols.filter(c => c.id !== collectionId));
    }
  }

  async pushLocalToCloud(localPath: string, workspaceId: string, name: string): Promise<CloudCollection> {
    const result = await this.api.getCollection(localPath);
    if (isIpcError(result)) {
      throw new Error(result.error.userMessage);
    }
    return this.createCollection(workspaceId, name, result.data);
  }

  async pullCloudToLocal(collection: CloudCollection, targetPath: string): Promise<void> {
    const result = await this.api.saveCollection(targetPath, collection.data);
    if (isIpcError(result)) {
      throw new Error(result.error.userMessage);
    }
  }

  clear(): void {
    this.workspaces.set([]);
    this.activeWorkspace.set(null);
    this.collections.set([]);
    this.pendingInvites.set([]);
    localStorage.removeItem(LAST_WORKSPACE_KEY);
  }
}

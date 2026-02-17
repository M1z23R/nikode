import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Workspace, CloudCollection } from '../models/cloud.model';
import { Collection } from '../models/collection.model';
import { isIpcError } from '@shared/ipc-types';

@Injectable({ providedIn: 'root' })
export class CloudWorkspaceService {
  private apiClient = inject(ApiClientService);
  private api = inject(ApiService);
  private authService = inject(AuthService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly activeWorkspace = signal<Workspace | null>(null);
  readonly collections = signal<CloudCollection[]>([]);
  readonly isLoading = signal(false);

  constructor() {
    this.authService.onLogin(() => this.loadWorkspaces());
    this.authService.onLogout(() => this.clear());
  }

  async loadWorkspaces(): Promise<void> {
    this.isLoading.set(true);
    try {
      const workspaces = await this.apiClient.get<Workspace[]>('/workspaces');
      this.workspaces.set(workspaces);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createWorkspace(name: string, teamId?: string): Promise<Workspace> {
    const body: { name: string; team_id?: string } = { name };
    if (teamId) {
      body.team_id = teamId;
    }
    const workspace = await this.apiClient.post<Workspace>('/workspaces', body);
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
      await this.loadCollections(workspace.id);
    } else {
      this.collections.set([]);
    }
  }

  async loadCollections(workspaceId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const collections = await this.apiClient.get<CloudCollection[]>(
        `/workspaces/${workspaceId}/collections`
      );
      this.collections.set(collections);
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
    const collection = await this.apiClient.post<CloudCollection>(
      `/workspaces/${workspaceId}/collections`,
      { name, data }
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
    const collection = await this.apiClient.patch<CloudCollection>(
      `/workspaces/${workspaceId}/collections/${collectionId}`,
      { data, version }
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
  }
}

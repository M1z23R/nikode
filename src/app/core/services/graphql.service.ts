import { Injectable, inject, signal } from '@angular/core';
import { TabsService, ToastService } from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { EnvironmentService } from './environment.service';
import { CollectionItem, KeyValue } from '../models/collection.model';
import {
  OpenGraphQLRequest,
  GraphQLResponse,
  CachedGraphQLSchema,
  createOpenGraphQLRequest,
} from '../models/graphql.model';
import { resolveVariables } from '../utils/variable-resolver';
import { getIntrospectionQuery, buildClientSchema } from 'graphql';
import { GraphQLTabContentComponent, GraphQLTabData } from '../../features/graphql-editor/graphql-tab-content.component';

const SCHEMA_STORAGE_KEY = 'nikode-graphql-schemas';

@Injectable({ providedIn: 'root' })
export class GraphQLService {
  private api = inject(ApiService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private environmentService = inject(EnvironmentService);
  private toastService = inject(ToastService);
  private tabsService = inject(TabsService);

  private openRequests = signal<OpenGraphQLRequest[]>([]);
  private schemaCache = new Map<string, CachedGraphQLSchema>();
  private schemasSignal = signal<Map<string, CachedGraphQLSchema>>(new Map());

  readonly requests = this.openRequests.asReadonly();
  readonly schemas = this.schemasSignal.asReadonly();

  constructor() {
    this.loadSchemasFromStorage();

    // Provide dirty tab data for remote update merges
    this.unifiedCollectionService.onGetDirtyTabUpdates((collectionPath) =>
      this.openRequests()
        .filter(r => r.collectionPath === collectionPath && r.dirty)
        .map(r => ({
          itemId: r.itemId,
          updates: {
            name: r.name, url: r.url, headers: r.headers,
            gqlQuery: r.query, gqlVariables: r.variables,
            gqlOperationName: r.operationName,
          }
        }))
    );

    // Refresh open requests when a collection is updated after merge resolution
    this.unifiedCollectionService.onCollectionRefreshed((collectionId, force) => {
      this.refreshOpenRequestsForCollection(collectionId, force);
    });
  }

  private loadSchemasFromStorage(): void {
    try {
      const raw = localStorage.getItem(SCHEMA_STORAGE_KEY);
      if (!raw) return;
      const entries: { url: string; introspectionResult: Record<string, unknown>; fetchedAt: number }[] = JSON.parse(raw);
      for (const entry of entries) {
        const schema = buildClientSchema(entry.introspectionResult as any);
        this.schemaCache.set(entry.url, {
          schema,
          introspectionResult: entry.introspectionResult,
          fetchedAt: entry.fetchedAt,
          url: entry.url,
        });
      }
      this.schemasSignal.set(new Map(this.schemaCache));
    } catch {
      // Corrupted storage — clear it
      localStorage.removeItem(SCHEMA_STORAGE_KEY);
    }
  }

  private saveSchemasToStorage(): void {
    const entries = [...this.schemaCache.values()].map(c => ({
      url: c.url,
      introspectionResult: c.introspectionResult,
      fetchedAt: c.fetchedAt,
    }));
    localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(entries));
  }

  openGraphQL(collectionPath: string, itemId: string): void {
    const item = this.unifiedCollectionService.findItem(collectionPath, itemId);
    if (!item || item.type !== 'graphql') return;

    const requestId = `${collectionPath}:${itemId}`;

    // Check if already open
    if (this.tabsService.getTab(requestId)) {
      this.tabsService.activateById(requestId);
      return;
    }

    const openRequest = createOpenGraphQLRequest(
      collectionPath,
      itemId,
      item.name,
      item.url || '',
      item.gqlQuery || '',
      item.gqlVariables || '',
      item.gqlOperationName || '',
      item.headers || []
    );
    this.openRequests.update(requests => [...requests, openRequest]);

    // Open tab
    const tabRef = this.tabsService.open<GraphQLTabContentComponent, GraphQLTabData, void>(
      GraphQLTabContentComponent,
      {
        id: requestId,
        label: item.name,
        data: { requestId },
        closable: true,
        activate: true,
      }
    );

    // Handle tab close
    tabRef.afterClosed().then(() => {
      this.openRequests.update(requests => requests.filter(r => r.id !== requestId));
    });
  }

  getRequest(requestId: string): OpenGraphQLRequest | undefined {
    return this.openRequests().find(r => r.id === requestId);
  }

  updateRequest(requestId: string, updates: Partial<OpenGraphQLRequest>): void {
    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? { ...r, ...updates, dirty: true } : r)
    );
  }

  async sendRequest(requestId: string): Promise<void> {
    const request = this.getRequest(requestId);
    if (!request) return;

    // Update loading state
    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? { ...r, loading: true, response: null } : r)
    );

    // Resolve variables in URL and headers
    const variables = this.environmentService.resolveVariables(request.collectionPath);
    const resolvedUrl = resolveVariables(request.url, variables);

    const headers: Record<string, string> = {};
    for (const h of request.headers) {
      if (h.enabled && h.key) {
        headers[h.key] = resolveVariables(h.value, variables);
      }
    }

    const result = await this.api.executeGraphQL({
      url: resolvedUrl,
      query: request.query,
      variables: request.variables,
      operationName: request.operationName || undefined,
      headers,
    });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      this.openRequests.update(requests =>
        requests.map(r => r.id === requestId ? { ...r, loading: false } : r)
      );
      return;
    }

    // Update with response
    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? {
        ...r,
        loading: false,
        response: result.data,
      } : r)
    );
  }

  saveRequest(requestId: string): void {
    const request = this.getRequest(requestId);
    if (!request) return;

    const updates: Partial<CollectionItem> = {
      name: request.name,
      url: request.url,
      headers: request.headers,
      gqlQuery: request.query,
      gqlVariables: request.variables,
      gqlOperationName: request.operationName,
    };

    this.unifiedCollectionService.updateItem(request.collectionPath, request.itemId, updates);
    this.unifiedCollectionService.save(request.collectionPath);

    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? { ...r, dirty: false } : r)
    );

    this.tabsService.updateLabel(requestId, request.name);
  }

  /**
   * Refresh open requests that belong to a collection from the collection data.
   * When force=true, also refreshes dirty tabs and clears their dirty flag.
   */
  private refreshOpenRequestsForCollection(collectionPath: string, force = false): void {
    this.openRequests.update(reqs =>
      reqs.map(req => {
        if (req.collectionPath !== collectionPath) return req;

        const item = this.unifiedCollectionService.findItem(collectionPath, req.itemId);
        if (!item || item.type !== 'graphql') return req;

        // Skip dirty requests unless force is set
        if (req.dirty && !force) return req;

        return {
          ...req,
          name: item.name,
          url: item.url || '',
          headers: item.headers || [],
          query: item.gqlQuery || '',
          variables: item.gqlVariables || '',
          operationName: item.gqlOperationName || '',
          dirty: force ? false : req.dirty,
        };
      })
    );

    // Update tab labels for refreshed requests
    for (const req of this.openRequests()) {
      if (req.collectionPath === collectionPath && !req.dirty) {
        this.tabsService.updateLabel(req.id, req.name);
      }
    }
  }

  async fetchSchema(requestId: string): Promise<void> {
    const request = this.getRequest(requestId);
    if (!request) return;

    // Set schemaLoading state
    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? { ...r, schemaLoading: true } : r)
    );

    // Resolve variables in URL and headers (same as sendRequest)
    const variables = this.environmentService.resolveVariables(request.collectionPath);
    const resolvedUrl = resolveVariables(request.url, variables);

    const headers: Record<string, string> = {};
    for (const h of request.headers) {
      if (h.enabled && h.key) {
        headers[h.key] = resolveVariables(h.value, variables);
      }
    }

    const result = await this.api.executeGraphQL({
      url: resolvedUrl,
      query: getIntrospectionQuery(),
      headers,
    });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      this.openRequests.update(requests =>
        requests.map(r => r.id === requestId ? { ...r, schemaLoading: false } : r)
      );
      return;
    }

    try {
      const introspectionResult = result.data.data as Record<string, unknown>;
      const schema = buildClientSchema(introspectionResult as any);
      const cached: CachedGraphQLSchema = {
        schema,
        introspectionResult,
        fetchedAt: Date.now(),
        url: resolvedUrl,
      };
      this.schemaCache.set(resolvedUrl, cached);
      this.schemasSignal.set(new Map(this.schemaCache));
      this.saveSchemasToStorage();
      this.toastService.success('GraphQL schema fetched successfully');
    } catch (e: any) {
      this.toastService.error(`Failed to parse schema: ${e.message}`);
    }

    this.openRequests.update(requests =>
      requests.map(r => r.id === requestId ? { ...r, schemaLoading: false } : r)
    );
  }

  getSchemaForUrl(url: string): CachedGraphQLSchema | undefined {
    return this.schemaCache.get(url);
  }

  resolveRequestUrl(requestId: string): string | null {
    const request = this.getRequest(requestId);
    if (!request) return null;
    const variables = this.environmentService.resolveVariables(request.collectionPath);
    return resolveVariables(request.url, variables);
  }
}

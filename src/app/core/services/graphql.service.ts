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
      const schema = buildClientSchema(result.data.data as any);
      const cached: CachedGraphQLSchema = {
        schema,
        fetchedAt: Date.now(),
        url: resolvedUrl,
      };
      this.schemaCache.set(resolvedUrl, cached);
      this.schemasSignal.set(new Map(this.schemaCache));
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

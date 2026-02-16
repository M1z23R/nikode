import { Injectable, inject, signal, computed } from '@angular/core';
import { TabsService, ToastService } from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { CollectionService } from './collection.service';
import { EnvironmentService } from './environment.service';
import { HttpLogService } from './http-log.service';
import { ScriptExecutorService, ScriptRequest } from './script-executor.service';
import { OpenRequest, createOpenRequest, ProxyRequest } from '../models/request.model';
import { CollectionItem, KeyValue, RequestBody, Scripts } from '../models/collection.model';
import { ResolvedVariables } from '../models/environment.model';
import { resolveVariables } from '../utils/variable-resolver';
import { RequestTabContentComponent, RequestTabData } from '../../features/request-editor/request-tab-content.component';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private api = inject(ApiService);
  private collectionService = inject(CollectionService);
  private environmentService = inject(EnvironmentService);
  private httpLogService = inject(HttpLogService);
  private toastService = inject(ToastService);
  private scriptExecutor = inject(ScriptExecutorService);
  private settingsService = inject(SettingsService);
  private tabsService = inject(TabsService);

  private openRequests = signal<OpenRequest[]>([]);
  private darkMode = signal(false);

  readonly requests = this.openRequests.asReadonly();
  readonly isDarkMode = this.darkMode.asReadonly();

  readonly activeId = computed(() => this.tabsService.activeTabId());

  readonly activeRequest = computed(() => {
    const id = this.tabsService.activeTabId();
    return id ? this.openRequests().find(r => r.id === id) : undefined;
  });

  constructor() {
    // Load dark mode preference
    const saved = localStorage.getItem('nikode-dark-mode');
    if (saved === 'true') {
      this.darkMode.set(true);
      document.documentElement.classList.add('dark');
    }
  }

  toggleDarkMode(): void {
    const newValue = !this.darkMode();
    this.darkMode.set(newValue);
    localStorage.setItem('nikode-dark-mode', String(newValue));
    if (newValue) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  openRequest(collectionPath: string, itemId: string): void {
    const item = this.collectionService.findItem(collectionPath, itemId);
    if (!item || item.type !== 'request') return;

    const requestId = `${collectionPath}:${itemId}`;

    // Check if already open
    if (this.tabsService.getTab(requestId)) {
      this.tabsService.activateById(requestId);
      return;
    }

    const openRequest = createOpenRequest(collectionPath, item);
    this.openRequests.update(reqs => [...reqs, openRequest]);

    // Open tab with dynamic tabs service
    const tabRef = this.tabsService.open<RequestTabContentComponent, RequestTabData, void>(
      RequestTabContentComponent,
      {
        id: requestId,
        label: item.name,
        data: { requestId },
        closable: true,
        activate: true
      }
    );

    // Handle tab close
    tabRef.afterClosed().then(() => {
      this.openRequests.update(reqs => reqs.filter(r => r.id !== requestId));
    });
  }

  closeRequest(requestId: string): void {
    this.tabsService.closeById(requestId);
  }

  setActiveRequest(requestId: string): void {
    this.tabsService.activateById(requestId);
  }

  updateRequest(requestId: string, updates: Partial<OpenRequest>): void {
    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, ...updates, dirty: true } : r)
    );

    // If autosave is enabled, save immediately
    if (this.settingsService.autosave) {
      this.saveRequest(requestId);
    } else {
      // Update tab label to show dirty indicator
      const request = this.openRequests().find(r => r.id === requestId);
      if (request) {
        this.tabsService.updateLabel(requestId, `${request.name} *`);
      }
    }
  }

  updateRequestMethod(requestId: string, method: OpenRequest['method']): void {
    this.updateRequest(requestId, { method });
  }

  updateRequestUrl(requestId: string, url: string): void {
    this.updateRequest(requestId, { url });
  }

  updateRequestHeaders(requestId: string, headers: KeyValue[]): void {
    this.updateRequest(requestId, { headers });
  }

  updateRequestBody(requestId: string, body: RequestBody): void {
    this.updateRequest(requestId, { body });
  }

  updateRequestScripts(requestId: string, scripts: Scripts): void {
    this.updateRequest(requestId, { scripts });
  }

  updateRequestParams(requestId: string, params: KeyValue[]): void {
    this.updateRequest(requestId, { params });
  }

  updateRequestDocs(requestId: string, docs: string): void {
    this.updateRequest(requestId, { docs });
  }

  saveRequest(requestId: string): void {
    const request = this.openRequests().find(r => r.id === requestId);
    if (!request) return;

    const updates: Partial<CollectionItem> = {
      name: request.name,
      method: request.method,
      url: request.url,
      params: request.params,
      headers: request.headers,
      body: request.body,
      scripts: request.scripts,
      docs: request.docs
    };

    this.collectionService.updateItem(request.collectionPath, request.itemId, updates);
    this.collectionService.saveCollection(request.collectionPath);
    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, dirty: false } : r)
    );
    // Update tab label to remove dirty indicator
    this.tabsService.updateLabel(requestId, request.name);
  }

  async sendRequest(requestId: string): Promise<void> {
    const request = this.openRequests().find(r => r.id === requestId);
    if (!request) return;

    // Set loading
    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, loading: true, response: undefined } : r)
    );

    // Resolve variables
    let variables = this.environmentService.resolveVariables(request.collectionPath);

    // Build initial request for pre-script
    let proxyRequest = this.buildProxyRequest(request, variables);

    // Execute pre-script if exists
    let requestVars = new Map<string, string>();
    if (request.scripts.pre?.trim()) {
      const scriptRequest: ScriptRequest = {
        method: proxyRequest.method,
        url: proxyRequest.url,
        headers: proxyRequest.headers,
        body: proxyRequest.body
      };

      const preResult = this.scriptExecutor.executePreScript(request.scripts.pre, {
        collectionPath: request.collectionPath,
        request: scriptRequest,
        variables
      });

      requestVars = preResult.requestVars;

      // Re-resolve variables with request-scoped vars merged in
      if (requestVars.size > 0) {
        variables = this.mergeVariables(
          this.environmentService.resolveVariables(request.collectionPath),
          requestVars
        );
        proxyRequest = this.buildProxyRequest(request, variables);
      }
    }

    const result = await this.api.executeRequest(proxyRequest);

    if (isIpcError(result)) {
      // Log the failed request
      this.httpLogService.log(proxyRequest, undefined, result.error.message);
      this.toastService.error(result.error.userMessage);

      this.openRequests.update(reqs =>
        reqs.map(r => r.id === requestId ? { ...r, loading: false } : r)
      );
      return;
    }

    const response = result.data;

    // Execute post-script if exists
    if (request.scripts.post?.trim()) {
      const scriptRequest: ScriptRequest = {
        method: proxyRequest.method,
        url: proxyRequest.url,
        headers: proxyRequest.headers,
        body: proxyRequest.body
      };

      this.scriptExecutor.executePostScript(request.scripts.post, {
        collectionPath: request.collectionPath,
        request: scriptRequest,
        variables,
        response: {
          statusCode: response.statusCode,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
          time: response.time,
          size: response.size
        }
      });
    }

    // Log the successful request/response
    this.httpLogService.log(proxyRequest, response);

    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, loading: false, response } : r)
    );
  }

  buildProxyRequest(request: OpenRequest, variables: ResolvedVariables): ProxyRequest {
    let resolvedUrl = resolveVariables(request.url, variables);

    // Append query params to URL
    if (request.params && request.params.length > 0) {
      const enabledParams = request.params.filter(p => p.enabled && p.key);
      if (enabledParams.length > 0) {
        const urlParams = new URLSearchParams();
        for (const param of enabledParams) {
          urlParams.append(param.key, resolveVariables(param.value, variables));
        }
        const separator = resolvedUrl.includes('?') ? '&' : '?';
        resolvedUrl = resolvedUrl + separator + urlParams.toString();
      }
    }

    // Build headers
    const headers: Record<string, string> = {};
    for (const h of request.headers) {
      if (h.enabled && h.key) {
        headers[h.key] = resolveVariables(h.value, variables);
      }
    }

    // Build body
    let body: string | undefined;
    if (request.body.type === 'json') {
      if (request.body.content) {
        body = resolveVariables(request.body.content, variables);
      }
      // Auto-set Content-Type for JSON
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (request.body.type === 'raw') {
      if (request.body.content) {
        body = resolveVariables(request.body.content, variables);
      }
    } else if (request.body.type === 'form-data' || request.body.type === 'x-www-form-urlencoded') {
      if (request.body.entries && request.body.entries.length > 0) {
        const enabledEntries = request.body.entries.filter(e => e.enabled && e.key);
        if (request.body.type === 'x-www-form-urlencoded') {
          const params = new URLSearchParams();
          for (const entry of enabledEntries) {
            params.append(entry.key, resolveVariables(entry.value, variables));
          }
          body = params.toString();
          // Set content-type header if not already set
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        } else {
          // For form-data, we'll send as JSON for now and let the proxy handle it
          // or convert to multipart in the future
          const formData: Record<string, string> = {};
          for (const entry of enabledEntries) {
            formData[entry.key] = resolveVariables(entry.value, variables);
          }
          body = JSON.stringify(formData);
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = 'multipart/form-data';
          }
        }
      }
    }

    return {
      method: request.method,
      url: resolvedUrl,
      headers,
      body
    };
  }

  private mergeVariables(
    envVars: ResolvedVariables,
    requestVars: Map<string, string>
  ): ResolvedVariables {
    const merged = { ...envVars };
    requestVars.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
  }
}

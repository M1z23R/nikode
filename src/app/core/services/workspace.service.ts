import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { TabsService, ToastService } from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { CollectionService } from './collection.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { EnvironmentService } from './environment.service';
import { HttpLogService } from './http-log.service';
import { ScriptExecutorService, ScriptRequest } from './script-executor.service';
import { OpenRequest, createOpenRequest, ProxyRequest, ProxyResponse } from '../models/request.model';
import { CollectionItem, KeyValue, RequestAuth, RequestBody, Scripts } from '../models/collection.model';
import { ResolvedVariables } from '../models/environment.model';
import { resolveVariables } from '../utils/variable-resolver';
import { RequestTabContentComponent, RequestTabData } from '../../features/request-editor/request-tab-content.component';
import { SettingsService } from './settings.service';
import { CookieJarService } from './cookie-jar.service';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private api = inject(ApiService);
  private collectionService = inject(CollectionService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private environmentService = inject(EnvironmentService);
  private httpLogService = inject(HttpLogService);
  private toastService = inject(ToastService);
  private scriptExecutor = inject(ScriptExecutorService);
  private settingsService = inject(SettingsService);
  private cookieJarService = inject(CookieJarService);
  private tabsService = inject(TabsService);

  private openRequests = signal<OpenRequest[]>([]);
  private darkMode = signal(false);
  private autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autosaveStartTimes = new Map<string, number>();
  private pollingTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; resolve: () => void }>();
  private pollingControls = new Map<string, { stopped: boolean }>();

  // Exposed for footer countdown indicator
  readonly autosaveCountdown = signal<{ startTime: number; delayMs: number } | null>(null);

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

    // Refresh open requests when a collection is updated after merge resolution
    this.unifiedCollectionService.onCollectionRefreshed((collectionId) => {
      this.refreshOpenRequestsForCollection(collectionId);
    });

    // Update countdown signal when active tab changes
    effect(() => {
      const activeId = this.activeId();
      if (activeId) {
        const startTime = this.autosaveStartTimes.get(activeId);
        if (startTime) {
          const delayMs = this.settingsService.autosaveDelay() * 1000;
          this.autosaveCountdown.set({ startTime, delayMs });
        } else {
          this.autosaveCountdown.set(null);
        }
      } else {
        this.autosaveCountdown.set(null);
      }
    });
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
    // Use unified service to find item (works for both local and cloud)
    const item = this.unifiedCollectionService.findItem(collectionPath, itemId);
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
      this.stopPolling(requestId);
      this.cancelScheduledSave(requestId);
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

    // Update tab label to show dirty indicator
    const request = this.openRequests().find(r => r.id === requestId);
    if (request) {
      this.tabsService.updateLabel(requestId, `${request.name} *`);
    }

    // If autosave is enabled, schedule a debounced save
    if (this.settingsService.autosave()) {
      this.scheduleSave(requestId);
    }
  }

  private scheduleSave(requestId: string): void {
    // Clear any existing timer for this request
    const existingTimer = this.autosaveTimers.get(requestId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule a new save
    const delayMs = this.settingsService.autosaveDelay() * 1000;
    const startTime = Date.now();
    this.autosaveStartTimes.set(requestId, startTime);

    // Update countdown signal if this is the active request
    if (this.activeId() === requestId) {
      this.autosaveCountdown.set({ startTime, delayMs });
    }

    const timer = setTimeout(() => {
      this.autosaveTimers.delete(requestId);
      this.autosaveStartTimes.delete(requestId);

      // Clear countdown if this was the active request
      if (this.activeId() === requestId) {
        this.autosaveCountdown.set(null);
      }

      // Only save if the request is still dirty
      const req = this.openRequests().find(r => r.id === requestId);
      if (req?.dirty) {
        this.saveRequest(requestId);
      }
    }, delayMs);

    this.autosaveTimers.set(requestId, timer);
  }

  private cancelScheduledSave(requestId: string): void {
    const timer = this.autosaveTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.autosaveTimers.delete(requestId);
      this.autosaveStartTimes.delete(requestId);

      // Clear countdown if this was the active request
      if (this.activeId() === requestId) {
        this.autosaveCountdown.set(null);
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

  updateRequestAuth(requestId: string, auth: RequestAuth): void {
    this.updateRequest(requestId, { auth });
  }

  updateRequestDocs(requestId: string, docs: string): void {
    this.updateRequest(requestId, { docs });
  }

  saveRequest(requestId: string): void {
    // Cancel any pending autosave
    this.cancelScheduledSave(requestId);

    const request = this.openRequests().find(r => r.id === requestId);
    if (!request) return;

    const updates: Partial<CollectionItem> = {
      name: request.name,
      method: request.method,
      url: request.url,
      params: request.params,
      headers: request.headers,
      body: request.body,
      auth: request.auth,
      scripts: request.scripts,
      docs: request.docs,
      pollingEnabled: request.pollingEnabled,
      pollingInterval: request.pollingInterval,
      pollingMaxIterations: request.pollingMaxIterations,
    };

    // Use unified service to update and save (handles both local and cloud)
    this.unifiedCollectionService.updateItem(request.collectionPath, request.itemId, updates);
    this.unifiedCollectionService.save(request.collectionPath);

    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, dirty: false } : r)
    );
    // Update tab label to remove dirty indicator
    this.tabsService.updateLabel(requestId, request.name);
  }

  async sendRequest(requestId: string): Promise<void> {
    const request = this.openRequests().find(r => r.id === requestId);
    if (!request) return;

    if (request.pollingEnabled) {
      if (request.polling) {
        this.stopPolling(requestId);
      } else {
        this.startPolling(requestId);
      }
      return;
    }

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

    // Refresh cookie cache if response has cookies
    if (response.cookies?.length > 0) {
      this.cookieJarService.loadCookies(request.collectionPath);
    }

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

    // Inject auth
    if (request.auth && request.auth.type !== 'none') {
      switch (request.auth.type) {
        case 'basic': {
          const username = resolveVariables(request.auth.basic?.username || '', variables);
          const password = resolveVariables(request.auth.basic?.password || '', variables);
          headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
          break;
        }
        case 'bearer': {
          const token = resolveVariables(request.auth.bearer?.token || '', variables);
          const prefix = resolveVariables(request.auth.bearer?.prefix || 'Bearer', variables);
          headers['Authorization'] = prefix + ' ' + token;
          break;
        }
        case 'api-key': {
          const key = resolveVariables(request.auth.apiKey?.key || '', variables);
          const value = resolveVariables(request.auth.apiKey?.value || '', variables);
          if (key) {
            if (request.auth.apiKey?.addTo === 'query') {
              const separator = resolvedUrl.includes('?') ? '&' : '?';
              resolvedUrl = resolvedUrl + separator + encodeURIComponent(key) + '=' + encodeURIComponent(value);
            } else {
              headers[key] = value;
            }
          }
          break;
        }
        case 'oauth2': {
          const accessToken = resolveVariables(request.auth.oauth2?.accessToken || '', variables);
          if (accessToken) {
            headers['Authorization'] = 'Bearer ' + accessToken;
          }
          break;
        }
      }
    }

    return {
      method: request.method,
      url: resolvedUrl,
      headers,
      body,
      collectionPath: request.collectionPath
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

  rerunPostScript(requestId: string): void {
    const request = this.openRequests().find(r => r.id === requestId);
    if (!request?.response || !request.scripts.post?.trim()) return;

    const variables = this.environmentService.resolveVariables(request.collectionPath);
    const proxyRequest = this.buildProxyRequest(request, variables);

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
        statusCode: request.response.statusCode,
        statusText: request.response.statusText,
        headers: request.response.headers,
        body: request.response.body,
        time: request.response.time,
        size: request.response.size
      }
    });
  }

  /**
   * Refresh open requests that belong to a collection from the collection data.
   * Used after merge conflict resolution to sync UI with resolved data.
   */
  refreshOpenRequestsForCollection(collectionPath: string): void {
    this.openRequests.update(reqs =>
      reqs.map(req => {
        if (req.collectionPath !== collectionPath) return req;

        // Find the updated item in the collection
        const item = this.unifiedCollectionService.findItem(collectionPath, req.itemId);
        if (!item || item.type !== 'request') return req;

        // Only refresh non-dirty requests (don't overwrite unsaved user changes)
        if (req.dirty) return req;

        // Update with collection data
        return {
          ...req,
          name: item.name,
          method: item.method ?? 'GET',
          url: item.url ?? '',
          params: item.params ?? [],
          headers: item.headers ?? [],
          body: item.body ?? { type: 'none' },
          auth: item.auth ?? { type: 'none' },
          scripts: item.scripts ?? { pre: '', post: '' },
          docs: item.docs ?? '',
          pollingEnabled: item.pollingEnabled ?? false,
          pollingInterval: item.pollingInterval ?? 5,
          pollingMaxIterations: item.pollingMaxIterations ?? 0,
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

  private startPolling(requestId: string): void {
    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, polling: true, pollingIteration: 0, loading: true, response: undefined } : r)
    );

    const pollingControl = { stopped: false };
    this.pollingControls.set(requestId, pollingControl);
    this.executePollingLoop(requestId, pollingControl);
  }

  private async executePollingLoop(requestId: string, pollingControl: { stopped: boolean }): Promise<void> {
    let iteration = 0;

    try {
      while (!pollingControl.stopped) {
        const request = this.openRequests().find(r => r.id === requestId);
        if (!request) break;

        // Check max iterations
        if (request.pollingMaxIterations > 0 && iteration >= request.pollingMaxIterations) break;

        // Update iteration counter
        this.openRequests.update(reqs =>
          reqs.map(r => r.id === requestId ? { ...r, pollingIteration: iteration } : r)
        );

        const result = await this.executeSingleRequest(requestId, iteration, pollingControl);
        if (!result.success) break;
        if (pollingControl.stopped) break;

        iteration++;

        // Check max iterations after this iteration completed
        const currentRequest = this.openRequests().find(r => r.id === requestId);
        if (!currentRequest) break;
        if (currentRequest.pollingMaxIterations > 0 && iteration >= currentRequest.pollingMaxIterations) break;

        // Wait for interval (resolve is stored so stopPolling can unblock it)
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => {
            this.pollingTimers.delete(requestId);
            resolve();
          }, (currentRequest.pollingInterval ?? 5) * 1000);
          this.pollingTimers.set(requestId, { timer, resolve });
        });
      }
    } finally {
      // Always clean up polling state
      this.pollingControls.delete(requestId);
      this.pollingTimers.delete(requestId);

      this.openRequests.update(reqs =>
        reqs.map(r => r.id === requestId ? { ...r, polling: false, loading: false } : r)
      );
    }
  }

  private async executeSingleRequest(
    requestId: string,
    iteration: number,
    pollingControl: { stopped: boolean }
  ): Promise<{ success: boolean; response?: ProxyResponse }> {
    const request = this.openRequests().find(r => r.id === requestId);
    if (!request) return { success: false };

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
        variables,
        iteration
      }, pollingControl);

      if (preResult.stopPolling) {
        pollingControl.stopped = true;
        return { success: true };
      }

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
      this.toastService.error(result.error.userMessage);
      return { success: false };
    }

    const response = result.data;

    // Refresh cookie cache if response has cookies
    if (response.cookies?.length > 0) {
      this.cookieJarService.loadCookies(request.collectionPath);
    }

    // Store response on the open request so UI shows latest
    this.openRequests.update(reqs =>
      reqs.map(r => r.id === requestId ? { ...r, response } : r)
    );

    // Log each iteration to history
    this.httpLogService.log(proxyRequest, response);

    // Execute post-script if exists
    if (request.scripts.post?.trim()) {
      const scriptRequest: ScriptRequest = {
        method: proxyRequest.method,
        url: proxyRequest.url,
        headers: proxyRequest.headers,
        body: proxyRequest.body
      };

      const postResult = this.scriptExecutor.executePostScript(request.scripts.post, {
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
        },
        iteration
      }, pollingControl);

      if (postResult.stopPolling) {
        pollingControl.stopped = true;
      }
    }

    return { success: true, response };
  }

  stopPolling(requestId: string): void {
    const control = this.pollingControls.get(requestId);
    if (control) {
      control.stopped = true;
    }

    const entry = this.pollingTimers.get(requestId);
    if (entry) {
      clearTimeout(entry.timer);
      entry.resolve(); // unblock the await so the loop can exit
      this.pollingTimers.delete(requestId);
    }
  }
}

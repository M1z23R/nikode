import { Injectable, inject, signal, computed } from '@angular/core';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { CollectionService } from './collection.service';
import { EnvironmentService } from './environment.service';
import { HttpLogService } from './http-log.service';
import { ScriptExecutorService } from './script-executor.service';
import { CollectionItem, KeyValue } from '../models/collection.model';
import { ProxyRequest, ProxyResponse } from '../models/request.model';
import {
  RunnerConfig,
  RunnerRequestItem,
  RunnerRequestResult,
  RunnerState,
  RunnerSummary,
  RunnerStatus,
  DataFile,
  AssertionResult,
  createDefaultConfig,
} from '../models/runner.model';
import { resolveVariables } from '../utils/variable-resolver';
import { ResolvedVariables } from '../models/environment.model';

@Injectable({ providedIn: 'root' })
export class RunnerService {
  private api = inject(ApiService);
  private collectionService = inject(CollectionService);
  private environmentService = inject(EnvironmentService);
  private httpLogService = inject(HttpLogService);
  private scriptExecutor = inject(ScriptExecutorService);

  private state = signal<RunnerState>({
    status: 'idle',
    config: createDefaultConfig(),
    requests: [],
    results: [],
    currentIteration: 0,
    currentRequestIndex: 0,
  });

  private abortController: AbortController | null = null;

  // Public readonly signals
  readonly runnerState = this.state.asReadonly();

  readonly status = computed(() => this.state().status);
  readonly requests = computed(() => this.state().requests);
  readonly results = computed(() => this.state().results);
  readonly config = computed(() => this.state().config);
  readonly currentIteration = computed(() => this.state().currentIteration);
  readonly currentRequestIndex = computed(() => this.state().currentRequestIndex);

  readonly summary = computed<RunnerSummary>(() => {
    const results = this.state().results;
    const state = this.state();

    return {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      duration: state.endTime && state.startTime ? state.endTime - state.startTime : 0,
      iterations: state.config.iterations,
    };
  });

  readonly isRunning = computed(() => this.state().status === 'running');

  /**
   * Initialize the runner with requests from a collection, folder, or single request
   */
  initialize(
    collectionPath: string,
    targetId: string | null, // null for entire collection, or folder/request id
    targetType: 'collection' | 'folder' | 'request'
  ): void {
    const col = this.collectionService.getCollection(collectionPath);
    if (!col) return;

    let items: CollectionItem[];

    if (targetType === 'collection' || targetId === null) {
      items = col.collection.items;
    } else {
      const item = this.findItemById(col.collection.items, targetId);
      if (!item) return;

      if (targetType === 'folder' && item.type === 'folder') {
        items = item.items || [];
      } else if (targetType === 'request' && item.type === 'request') {
        items = [item];
      } else {
        return;
      }
    }

    const requests = this.flattenRequests(items, []);

    this.state.set({
      status: 'idle',
      config: createDefaultConfig(),
      requests,
      results: [],
      currentIteration: 0,
      currentRequestIndex: 0,
    });
  }

  /**
   * Update runner configuration
   */
  updateConfig(updates: Partial<RunnerConfig>): void {
    this.state.update(s => ({
      ...s,
      config: { ...s.config, ...updates },
    }));
  }

  /**
   * Toggle request selection
   */
  toggleRequest(requestId: string): void {
    this.state.update(s => ({
      ...s,
      requests: s.requests.map(r =>
        r.id === requestId ? { ...r, selected: !r.selected } : r
      ),
    }));
  }

  /**
   * Select all requests
   */
  selectAll(): void {
    this.state.update(s => ({
      ...s,
      requests: s.requests.map(r => ({ ...r, selected: true })),
    }));
  }

  /**
   * Deselect all requests
   */
  deselectAll(): void {
    this.state.update(s => ({
      ...s,
      requests: s.requests.map(r => ({ ...r, selected: false })),
    }));
  }

  /**
   * Start the runner
   */
  async run(collectionPath: string): Promise<void> {
    const state = this.state();
    const selectedRequests = state.requests.filter(r => r.selected);

    if (selectedRequests.length === 0) return;

    this.abortController = new AbortController();

    this.state.update(s => ({
      ...s,
      status: 'running',
      results: [],
      currentIteration: 0,
      currentRequestIndex: 0,
      startTime: Date.now(),
      endTime: undefined,
    }));

    const config = state.config;

    try {
      if (config.mode === 'sequential') {
        await this.runSequential(collectionPath, selectedRequests, config);
      } else {
        await this.runParallel(collectionPath, selectedRequests, config);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.state.update(s => ({ ...s, status: 'stopped' }));
      }
    } finally {
      this.state.update(s => ({
        ...s,
        status: s.status === 'running' ? 'completed' : s.status,
        endTime: Date.now(),
      }));
      this.abortController = null;
    }
  }

  /**
   * Stop the running execution
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.state.update(s => ({ ...s, status: 'stopped' }));
  }

  /**
   * Reset the runner state
   */
  reset(): void {
    this.state.update(s => ({
      ...s,
      status: 'idle',
      results: [],
      currentIteration: 0,
      currentRequestIndex: 0,
      startTime: undefined,
      endTime: undefined,
    }));
  }

  /**
   * Parse and load a data file
   */
  loadDataFile(file: File): Promise<DataFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = reader.result as string;
          const type = file.name.endsWith('.csv') ? 'csv' : 'json';
          const data = type === 'csv' ? this.parseCsv(content) : JSON.parse(content);

          if (!Array.isArray(data)) {
            reject(new Error('Data file must contain an array'));
            return;
          }

          resolve({
            name: file.name,
            type,
            data,
          });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private async runSequential(
    collectionPath: string,
    requests: RunnerRequestItem[],
    config: RunnerConfig
  ): Promise<void> {
    for (let iteration = 0; iteration < config.iterations; iteration++) {
      if (this.abortController?.signal.aborted) break;

      this.state.update(s => ({ ...s, currentIteration: iteration }));

      // Get iteration-specific variables from data file
      const dataVariables = config.dataFile?.data[iteration] || {};

      for (let i = 0; i < requests.length; i++) {
        if (this.abortController?.signal.aborted) break;

        this.state.update(s => ({ ...s, currentRequestIndex: i }));

        const request = requests[i];
        const result = await this.executeRequest(
          collectionPath,
          request,
          iteration,
          config,
          dataVariables
        );

        this.state.update(s => ({
          ...s,
          results: [...s.results, result],
        }));

        // Stop on error if configured
        if (config.stopOnError && result.status === 'failed') {
          // Mark remaining requests as skipped
          this.skipRemainingRequests(requests, i + 1, iteration);
          return;
        }

        // Delay between requests
        if (config.delayMs > 0 && i < requests.length - 1) {
          await this.delay(config.delayMs);
        }
      }

      // Delay between iterations
      if (config.delayMs > 0 && iteration < config.iterations - 1) {
        await this.delay(config.delayMs);
      }
    }
  }

  private async runParallel(
    collectionPath: string,
    requests: RunnerRequestItem[],
    config: RunnerConfig
  ): Promise<void> {
    for (let iteration = 0; iteration < config.iterations; iteration++) {
      if (this.abortController?.signal.aborted) break;

      this.state.update(s => ({ ...s, currentIteration: iteration }));

      const dataVariables = config.dataFile?.data[iteration] || {};

      const promises = requests.map((request) =>
        this.executeRequest(collectionPath, request, iteration, config, dataVariables)
          .then(result => {
            this.state.update(s => ({
              ...s,
              results: [...s.results, result],
            }));
            return result;
          })
      );

      const results = await Promise.all(promises);

      // Check for failures if stop on error is enabled
      if (config.stopOnError && results.some(r => r.status === 'failed')) {
        break;
      }

      // Delay between iterations
      if (config.delayMs > 0 && iteration < config.iterations - 1) {
        await this.delay(config.delayMs);
      }
    }
  }

  private async executeRequest(
    collectionPath: string,
    request: RunnerRequestItem,
    iteration: number,
    config: RunnerConfig,
    dataVariables: Record<string, string>
  ): Promise<RunnerRequestResult> {
    const startTime = Date.now();

    // Resolve environment variables
    let variables: ResolvedVariables;
    if (config.environmentId) {
      // Use the specified environment
      const col = this.collectionService.getCollection(collectionPath);
      const env = col?.collection.environments.find(e => e.id === config.environmentId);
      const secrets = this.environmentService.getSecrets(collectionPath);

      variables = {};
      if (env) {
        for (const v of env.variables) {
          if (!v.enabled) continue;
          if (v.secret) {
            const secretValue = secrets?.[env.id]?.[v.key];
            if (secretValue !== undefined) {
              variables[v.key] = secretValue;
            }
          } else {
            variables[v.key] = v.value;
          }
        }
      }
    } else {
      variables = this.environmentService.resolveVariables(collectionPath);
    }

    // Merge data file variables (they override environment variables)
    const mergedVariables = { ...variables, ...dataVariables };

    try {
      const item = request.item;

      // Resolve URL with variables
      let resolvedUrl = resolveVariables(item.url || '', mergedVariables);

      // Append query params
      if (item.params && item.params.length > 0) {
        const enabledParams = item.params.filter(p => p.enabled && p.key);
        if (enabledParams.length > 0) {
          const urlParams = new URLSearchParams();
          for (const param of enabledParams) {
            urlParams.append(param.key, resolveVariables(param.value, mergedVariables));
          }
          const separator = resolvedUrl.includes('?') ? '&' : '?';
          resolvedUrl = resolvedUrl + separator + urlParams.toString();
        }
      }

      // Build headers
      const headers: Record<string, string> = {};
      for (const h of (item.headers || [])) {
        if (h.enabled && h.key) {
          headers[h.key] = resolveVariables(h.value, mergedVariables);
        }
      }

      // Build body
      let body: string | undefined;
      if (item.body) {
        if (item.body.type === 'json' || item.body.type === 'raw') {
          if (item.body.content) {
            body = resolveVariables(item.body.content, mergedVariables);
          }
        } else if (item.body.type === 'x-www-form-urlencoded') {
          if (item.body.entries && item.body.entries.length > 0) {
            const enabledEntries = item.body.entries.filter(e => e.enabled && e.key);
            const params = new URLSearchParams();
            for (const entry of enabledEntries) {
              params.append(entry.key, resolveVariables(entry.value, mergedVariables));
            }
            body = params.toString();
            if (!headers['Content-Type'] && !headers['content-type']) {
              headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
          }
        } else if (item.body.type === 'form-data') {
          if (item.body.entries && item.body.entries.length > 0) {
            const enabledEntries = item.body.entries.filter(e => e.enabled && e.key);
            const formData: Record<string, string> = {};
            for (const entry of enabledEntries) {
              formData[entry.key] = resolveVariables(entry.value, mergedVariables);
            }
            body = JSON.stringify(formData);
            if (!headers['Content-Type'] && !headers['content-type']) {
              headers['Content-Type'] = 'multipart/form-data';
            }
          }
        }
      }

      const proxyRequest: ProxyRequest = {
        method: item.method || 'GET',
        url: resolvedUrl,
        headers,
        body,
      };

      const result = await this.api.executeRequest(proxyRequest);
      const duration = Date.now() - startTime;

      if (isIpcError(result)) {
        // Log the failed request
        this.httpLogService.log(proxyRequest, undefined, result.error.message);

        return {
          requestId: request.id,
          requestName: request.name,
          method: request.method,
          iteration,
          status: 'failed',
          error: result.error.message,
          duration,
        };
      }

      const response = result.data;

      // Log the request
      this.httpLogService.log(proxyRequest, response);

      // Execute post-script and collect assertions
      const postScript = item.scripts?.post;
      let assertions: AssertionResult[] = [];

      if (postScript?.trim()) {
        const scriptResult = this.scriptExecutor.executePostScript(postScript, {
          collectionPath,
          request: {
            method: proxyRequest.method,
            url: proxyRequest.url,
            headers: proxyRequest.headers ?? {},
            body: proxyRequest.body,
          },
          variables: mergedVariables,
          response: {
            statusCode: response.statusCode,
            statusText: response.statusText,
            headers: response.headers,
            body: response.body,
            time: response.time,
            size: response.size,
          },
        });
        assertions = scriptResult.assertions;
      }

      // Determine pass/fail: status code must be OK AND all assertions must pass
      const statusCodePassed = response.statusCode >= 200 && response.statusCode < 300;
      const assertionsPassed = assertions.every(a => a.passed);
      const passed = statusCodePassed && assertionsPassed;

      return {
        requestId: request.id,
        requestName: request.name,
        method: request.method,
        iteration,
        status: passed ? 'passed' : 'failed',
        response,
        duration,
        assertions,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        requestId: request.id,
        requestName: request.name,
        method: request.method,
        iteration,
        status: 'failed',
        error: errorMessage,
        duration,
      };
    }
  }

  private skipRemainingRequests(
    requests: RunnerRequestItem[],
    startIndex: number,
    iteration: number
  ): void {
    for (let i = startIndex; i < requests.length; i++) {
      const request = requests[i];
      this.state.update(s => ({
        ...s,
        results: [
          ...s.results,
          {
            requestId: request.id,
            requestName: request.name,
            method: request.method,
            iteration,
            status: 'skipped' as const,
          },
        ],
      }));
    }
  }

  private flattenRequests(
    items: CollectionItem[],
    path: string[]
  ): RunnerRequestItem[] {
    const requests: RunnerRequestItem[] = [];

    for (const item of items) {
      if (item.type === 'request') {
        requests.push({
          id: item.id,
          name: item.name,
          method: item.method || 'GET',
          url: item.url || '',
          item,
          selected: true,
          path,
        });
      } else if (item.type === 'folder' && item.items) {
        requests.push(...this.flattenRequests(item.items, [...path, item.name]));
      }
    }

    return requests;
  }

  private findItemById(items: CollectionItem[], id: string): CollectionItem | undefined {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.items) {
        const found = this.findItemById(item.items, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  private parseCsv(content: string): Record<string, string>[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = this.parseCsvLine(lines[0]);
    const data: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    return data;
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

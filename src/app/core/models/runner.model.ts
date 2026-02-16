import { CollectionItem, HttpMethod } from './collection.model';
import { ProxyResponse } from './request.model';

export interface RunnerConfig {
  // Execution settings
  mode: 'sequential' | 'parallel';
  stopOnError: boolean;
  delayMs: number;

  // Iterations
  iterations: number;
  dataFile?: DataFile;

  // Environment override (null = use collection's active environment)
  environmentId: string | null;
}

export interface DataFile {
  name: string;
  type: 'json' | 'csv';
  data: Record<string, string>[];
}

export interface RunnerRequestItem {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  item: CollectionItem;
  selected: boolean;
  path: string[]; // folder path for display
}

export type RunnerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';

export interface RunnerRequestResult {
  requestId: string;
  requestName: string;
  method: HttpMethod;
  iteration: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  response?: ProxyResponse;
  error?: string;
  duration?: number;
  assertions?: AssertionResult[];
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface RunnerState {
  status: RunnerStatus;
  config: RunnerConfig;
  requests: RunnerRequestItem[];
  results: RunnerRequestResult[];
  currentIteration: number;
  currentRequestIndex: number;
  startTime?: number;
  endTime?: number;
}

export interface RunnerSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  iterations: number;
}

export function createDefaultConfig(): RunnerConfig {
  return {
    mode: 'sequential',
    stopOnError: false,
    delayMs: 0,
    iterations: 1,
    environmentId: null,
  };
}

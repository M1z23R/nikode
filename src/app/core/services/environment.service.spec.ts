import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { EnvironmentService } from './environment.service';
import { ApiService } from './api.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { ToastService } from '@m1z23r/ngx-ui';
import { UnifiedCollection } from '../models/collection.model';

const COL_PATH = '/tmp/col';
const ENV_ID = 'env-1';

function makeCollection(): UnifiedCollection {
  return {
    id: COL_PATH,
    source: 'local',
    name: 'Test',
    expanded: false,
    dirty: false,
    path: COL_PATH,
    collection: {
      name: 'Test',
      version: '1',
      activeEnvironmentId: ENV_ID,
      items: [],
      environments: [
        {
          id: ENV_ID,
          name: 'Default',
          variables: [
            { key: 'plain', value: 'old', enabled: true },
            { key: 'token', value: '', enabled: true, secret: true },
          ],
        },
      ],
    },
  } as unknown as UnifiedCollection;
}

let store: UnifiedCollection;
let savedSecrets: Record<string, Record<string, string>> | null;
const toastErrors: string[] = [];

const mockToast = {
  error: (msg: string) => { toastErrors.push(msg); },
  success: () => {},
};

const mockUnified = {
  collections: signal<UnifiedCollection[]>([]),
  getCollection: (_path: string) => store,
  updateCollection: (_path: string, collection: UnifiedCollection['collection']) => {
    store = { ...store, collection } as UnifiedCollection;
  },
};

const mockApi = {
  getSecrets: vi.fn(async () => ({ success: true, data: {} })),
  saveSecrets: vi.fn(async (_path: string, secrets: Record<string, Record<string, string>>) => {
    savedSecrets = secrets;
    return { success: true, data: { status: 'ok' } };
  }),
};

function setup(): EnvironmentService {
  TestBed.configureTestingModule({
    providers: [
      EnvironmentService,
      { provide: ApiService, useValue: mockApi },
      { provide: UnifiedCollectionService, useValue: mockUnified },
      { provide: ToastService, useValue: mockToast },
    ],
  });
  return TestBed.inject(EnvironmentService);
}

describe('EnvironmentService.setVariableValue (hover edit)', () => {
  beforeEach(() => {
    store = makeCollection();
    savedSecrets = null;
    toastErrors.length = 0;
    mockApi.saveSecrets.mockClear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('updates an existing non-secret variable without "already exists" error', () => {
    const service = setup();
    const ok = service.setVariableValue(COL_PATH, ENV_ID, 'plain', 'new');
    expect(ok).toBe(true);
    expect(toastErrors).toEqual([]);
    expect(store.collection.environments[0].variables.find(v => v.key === 'plain')?.value).toBe('new');
  });

  it('updates an existing secret variable via the secret store, not addVariable', () => {
    const service = setup();
    const ok = service.setVariableValue(COL_PATH, ENV_ID, 'token', 'sekret');
    expect(ok).toBe(true);
    expect(toastErrors).toEqual([]);
    expect(mockApi.saveSecrets).toHaveBeenCalled();
    expect(savedSecrets?.[ENV_ID]?.['token']).toBe('sekret');
  });

  it('creates a brand new variable when the key does not exist', () => {
    const service = setup();
    const ok = service.setVariableValue(COL_PATH, ENV_ID, 'fresh', 'val');
    expect(ok).toBe(true);
    expect(toastErrors).toEqual([]);
    expect(store.collection.environments[0].variables.find(v => v.key === 'fresh')?.value).toBe('val');
  });
});

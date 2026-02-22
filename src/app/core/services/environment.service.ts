import { Injectable, inject, signal, effect } from '@angular/core';
import { ToastService, TemplateVariable } from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { Secrets, ResolvedVariables } from '../models/environment.model';
import { Environment, Variable, UnifiedCollection } from '../models/collection.model';
import { isDynamicVariable, getDynamicVariableDescription } from '../utils/dynamic-variables';

@Injectable({ providedIn: 'root' })
export class EnvironmentService {
  private api = inject(ApiService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private toastService = inject(ToastService);

  private secretsCache = signal<Map<string, Secrets>>(new Map());
  private pendingLoads = new Set<string>();

  constructor() {
    // Auto-load secrets for all collections (local and cloud)
    // Secrets are always stored locally on the user's machine
    effect(() => {
      const allCollections = this.unifiedCollectionService.collections();
      const cache = this.secretsCache();

      for (const col of allCollections) {
        if (!cache.has(col.id) && !this.pendingLoads.has(col.id)) {
          this.pendingLoads.add(col.id);
          this.loadSecrets(col.id).finally(() => {
            this.pendingLoads.delete(col.id);
          });
        }
      }
    });
  }

  // Helper to get unified collection (works for both local and cloud)
  private getUnifiedCollection(collectionPath: string): UnifiedCollection | undefined {
    return this.unifiedCollectionService.getCollection(collectionPath);
  }

  // Helper to safely get environments array (handles templates without environments)
  private getEnvironments(collectionPath: string): Environment[] {
    const col = this.getUnifiedCollection(collectionPath);
    return col?.collection.environments ?? [];
  }

  async loadSecrets(collectionPath: string): Promise<void> {
    const result = await this.api.getSecrets(collectionPath);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return;
    }

    this.secretsCache.update(cache => {
      const newCache = new Map(cache);
      newCache.set(collectionPath, result.data);
      return newCache;
    });
  }

  getSecrets(collectionPath: string): Secrets | undefined {
    return this.secretsCache().get(collectionPath);
  }

  async saveSecrets(collectionPath: string, secrets: Secrets): Promise<boolean> {
    const result = await this.api.saveSecrets(collectionPath, secrets);
    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return false;
    }

    this.secretsCache.update(cache => {
      const newCache = new Map(cache);
      newCache.set(collectionPath, secrets);
      return newCache;
    });
    return true;
  }

  updateSecret(collectionPath: string, envId: string, key: string, value: string): void {
    const secrets = this.getSecrets(collectionPath) || {};
    const updatedSecrets: Secrets = {
      ...secrets,
      [envId]: {
        ...(secrets[envId] || {}),
        [key]: value
      }
    };
    this.saveSecrets(collectionPath, updatedSecrets);
  }

  getActiveEnvironment(collectionPath: string): Environment | undefined {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return undefined;

    const environments = col.collection.environments ?? [];

    // Auto-create a default environment if none exist
    if (environments.length === 0) {
      this.addEnvironment(collectionPath, 'Default');
      // Re-fetch after creating
      const updatedCol = this.getUnifiedCollection(collectionPath);
      return updatedCol?.collection.environments?.[0];
    }

    return environments.find(
      e => e.id === col.collection.activeEnvironmentId
    ) ?? environments[0]; // Fallback to first environment if active not found
  }

  setActiveEnvironment(collectionPath: string, envId: string): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      activeEnvironmentId: envId
    });
  }

  getTemplateVariables(collectionPath: string): TemplateVariable[] {
    const env = this.getActiveEnvironment(collectionPath);
    if (!env) return [];
    const secrets = this.getSecrets(collectionPath);
    return env.variables
      .filter(v => v.enabled)
      .map(v => ({
        key: v.key,
        value: v.secret
          ? (secrets?.[env.id]?.[v.key] ?? '')
          : v.value,
      }));
  }

  resolveVariables(collectionPath: string): ResolvedVariables {
    const env = this.getActiveEnvironment(collectionPath);
    const col = this.getUnifiedCollection(collectionPath);

    const secrets = this.getSecrets(collectionPath);

    if (!env || !col) return {};

    const resolved: ResolvedVariables = {};

    for (const variable of env.variables) {
      if (!variable.enabled) continue;

      if (variable.secret) {
        // Get from secrets
        const secretValue = secrets?.[env.id]?.[variable.key];
        if (secretValue !== undefined) {
          resolved[variable.key] = secretValue;
        }
      } else {
        resolved[variable.key] = variable.value;
      }
    }

    return resolved;
  }

  /**
   * Gets detailed variable info including secret status for tooltip display.
   */
  getVariableInfo(collectionPath: string, key: string): { value: string | undefined; isSecret: boolean; isDynamic?: boolean } | undefined {
    if (isDynamicVariable(key)) {
      return { value: getDynamicVariableDescription(key), isSecret: false, isDynamic: true };
    }

    const env = this.getActiveEnvironment(collectionPath);
    if (!env) return undefined;

    const variable = env.variables.find(v => v.key === key && v.enabled);
    if (!variable) return undefined;

    const isSecret = variable.secret ?? false;

    if (isSecret) {
      const secrets = this.getSecrets(collectionPath);
      const value = secrets?.[env.id]?.[variable.key];
      return { value, isSecret: true };
    }

    return { value: variable.value, isSecret: false };
  }

  addEnvironment(collectionPath: string, name: string): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const newEnv: Environment = {
      id: `env-${Date.now()}`,
      name,
      variables: []
    };

    const environments = col.collection.environments ?? [];
    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: [...environments, newEnv]
    });
  }

  updateEnvironment(collectionPath: string, envId: string, updates: Partial<Environment>): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const environments = col.collection.environments ?? [];
    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: environments.map(e =>
        e.id === envId ? { ...e, ...updates } : e
      )
    });
  }

  deleteEnvironment(collectionPath: string, envId: string): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const environments = col.collection.environments ?? [];
    const remainingEnvs = environments.filter(e => e.id !== envId);

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: remainingEnvs,
      activeEnvironmentId: col.collection.activeEnvironmentId === envId
        ? (remainingEnvs[0]?.id || '')
        : col.collection.activeEnvironmentId
    });
  }

  addVariable(collectionPath: string, envId: string, variable: Variable): boolean {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return false;

    const environments = col.collection.environments ?? [];
    const env = environments.find(e => e.id === envId);
    if (!env) return false;

    // Check for duplicate key (only if key is non-empty)
    if (variable.key && env.variables.some(v => v.key === variable.key)) {
      this.toastService.error(`Variable "${variable.key}" already exists`);
      return false;
    }

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: environments.map(e =>
        e.id === envId
          ? { ...e, variables: [...e.variables, variable] }
          : e
      )
    });
    return true;
  }

  updateVariable(collectionPath: string, envId: string, index: number, updates: Partial<Variable>): boolean {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return false;

    const environments = col.collection.environments ?? [];
    const env = environments.find(e => e.id === envId);
    if (!env) return false;
    if (index < 0 || index >= env.variables.length) return false;

    // Check for duplicate key if key is being changed
    const currentKey = env.variables[index].key;
    if (updates.key !== undefined && updates.key !== currentKey && updates.key !== '') {
      if (env.variables.some((v, i) => i !== index && v.key === updates.key)) {
        this.toastService.error(`Variable "${updates.key}" already exists`);
        return false;
      }
    }

    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: environments.map(e =>
        e.id === envId
          ? {
              ...e,
              variables: e.variables.map((v, i) =>
                i === index ? { ...v, ...updates } : v
              )
            }
          : e
      )
    });
    return true;
  }

  deleteVariable(collectionPath: string, envId: string, index: number): void {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return;

    const environments = col.collection.environments ?? [];
    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: environments.map(e =>
        e.id === envId
          ? { ...e, variables: e.variables.filter((_, i) => i !== index) }
          : e
      )
    });
  }

  /**
   * Exports an environment to a JSON object.
   * @param includeSecrets Whether to include secret values in the export.
   */
  exportEnvironment(
    collectionPath: string,
    envId: string,
    includeSecrets: boolean
  ): ExportedEnvironment | undefined {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) return undefined;

    const environments = col.collection.environments ?? [];
    const env = environments.find(e => e.id === envId);
    if (!env) return undefined;

    const exported: ExportedEnvironment = {
      name: env.name,
      variables: env.variables.map(v => ({
        key: v.key,
        value: v.secret ? '' : v.value,
        enabled: v.enabled,
        secret: v.secret ?? false
      }))
    };

    if (includeSecrets) {
      const secrets = this.getSecrets(collectionPath);
      const envSecrets = secrets?.[envId];
      if (envSecrets) {
        exported.secrets = { ...envSecrets };
      }
    }

    return exported;
  }

  /**
   * Imports an environment from a JSON object.
   * @returns The ID of the imported environment.
   */
  importEnvironment(
    collectionPath: string,
    data: ExportedEnvironment
  ): string {
    const col = this.getUnifiedCollection(collectionPath);
    if (!col) throw new Error('Collection not found');

    const newEnvId = `env-${Date.now()}`;
    const newEnv: Environment = {
      id: newEnvId,
      name: data.name,
      variables: data.variables.map(v => ({
        key: v.key,
        value: v.secret ? '' : v.value,
        enabled: v.enabled,
        secret: v.secret
      }))
    };

    const environments = col.collection.environments ?? [];
    this.unifiedCollectionService.updateCollection(collectionPath, {
      ...col.collection,
      environments: [...environments, newEnv]
    });

    // Import secrets if provided
    if (data.secrets) {
      const currentSecrets = this.getSecrets(collectionPath) || {};
      const updatedSecrets: Secrets = {
        ...currentSecrets,
        [newEnvId]: { ...data.secrets }
      };
      this.saveSecrets(collectionPath, updatedSecrets);
    }

    return newEnvId;
  }
}

export interface ExportedEnvironment {
  name: string;
  variables: {
    key: string;
    value: string;
    enabled: boolean;
    secret: boolean;
  }[];
  secrets?: Record<string, string>;
}

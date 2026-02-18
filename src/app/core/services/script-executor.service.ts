import { Injectable, inject } from '@angular/core';
import { EnvironmentService } from './environment.service';
import { ConsoleService } from './console.service';
import { ResolvedVariables } from '../models/environment.model';
import { AssertionResult } from '../models/runner.model';

export interface ScriptRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface ScriptResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  size: number;
}

export interface PreScriptContext {
  collectionPath: string;
  request: ScriptRequest;
  variables: ResolvedVariables;
}

export interface PostScriptContext extends PreScriptContext {
  response: ScriptResponse;
}

export interface ScriptResult {
  success: boolean;
  error?: string;
  requestVars: Map<string, string>;
  assertions: AssertionResult[];
}

@Injectable({ providedIn: 'root' })
export class ScriptExecutorService {
  private environmentService = inject(EnvironmentService);
  private consoleService = inject(ConsoleService);

  executePreScript(script: string, context: PreScriptContext): ScriptResult {
    const requestVars = new Map<string, string>();
    const assertions: AssertionResult[] = [];

    if (!script.trim()) {
      return { success: true, requestVars, assertions };
    }

    const sandbox = this.buildSandbox(context, requestVars, assertions);

    return this.executeScript(script, sandbox, requestVars, assertions);
  }

  executePostScript(script: string, context: PostScriptContext): ScriptResult {
    const requestVars = new Map<string, string>();
    const assertions: AssertionResult[] = [];

    if (!script.trim()) {
      return { success: true, requestVars, assertions };
    }

    const sandbox = this.buildSandbox(context, requestVars, assertions, context.response);

    return this.executeScript(script, sandbox, requestVars, assertions);
  }

  private buildSandbox(
    context: PreScriptContext,
    requestVars: Map<string, string>,
    assertions: AssertionResult[],
    response?: ScriptResponse
  ): Record<string, unknown> {
    const { collectionPath, request, variables } = context;

    const nk: Record<string, unknown> = {
      getEnv: (key: string): string | undefined => {
        return variables[key];
      },

      setEnv: (key: string, value: string): void => {
        const env = this.environmentService.getActiveEnvironment(collectionPath);
        if (env) {
          const existingIndex = env.variables.findIndex(v => v.key === key);
          if (existingIndex !== -1) {
            const existingVar = env.variables[existingIndex];
            if (existingVar.secret) {
              // Secret variables store their value in the secrets cache, not in v.value
              this.environmentService.updateSecret(collectionPath, env.id, key, value);
            } else {
              this.environmentService.updateVariable(collectionPath, env.id, existingIndex, { value });
            }
          } else {
            this.environmentService.addVariable(collectionPath, env.id, {
              key,
              value,
              enabled: true
            });
          }
          // Also update local variables for immediate access
          variables[key] = value;
        }
      },

      getVar: (key: string): string | undefined => {
        return requestVars.get(key);
      },

      setVar: (key: string, value: string): void => {
        requestVars.set(key, value);
      },

      request: Object.freeze({
        method: request.method,
        url: request.url,
        headers: Object.freeze({ ...request.headers }),
        body: request.body
      }),

      test: (name: string, fn: () => void): void => {
        try {
          fn();
          assertions.push({ name, passed: true });
          this.consoleService.info(`✓ ${name}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          assertions.push({ name, passed: false, message });
          this.consoleService.error(`✗ ${name}: ${message}`);
        }
      },

      assert: (condition: boolean, message?: string): void => {
        if (!condition) {
          throw new Error(message ?? 'Assertion failed');
        }
      }
    };

    if (response) {
      nk['response'] = Object.freeze({
        statusCode: response.statusCode,
        statusText: response.statusText,
        headers: Object.freeze({ ...response.headers }),
        body: response.body,
        time: response.time,
        size: response.size
      });
    }

    const consoleProxy = {
      log: (...args: unknown[]): void => {
        this.consoleService.info(this.formatArgs(args));
      },
      warn: (...args: unknown[]): void => {
        this.consoleService.warn(this.formatArgs(args));
      },
      error: (...args: unknown[]): void => {
        this.consoleService.error(this.formatArgs(args));
      }
    };

    return { nk, console: consoleProxy };
  }

  private executeScript(
    script: string,
    sandbox: Record<string, unknown>,
    requestVars: Map<string, string>,
    assertions: AssertionResult[]
  ): ScriptResult {
    const keys = Object.keys(sandbox);
    const values = Object.values(sandbox);

    try {
      const fn = new Function(...keys, script);
      fn(...values);
      return { success: true, requestVars, assertions };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.consoleService.error(`Script error: ${errorMessage}`);
      return { success: false, error: errorMessage, requestVars, assertions };
    }
  }

  private formatArgs(args: unknown[]): string {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }
}

import { ResolvedVariables } from '../models/environment.model';
import { RequestAuth } from '../models/collection.model';
import { resolveDynamicVariable } from './dynamic-variables';

const VARIABLE_PATTERN = /\{\{(\$?\w+)\}\}/g;

export function resolveVariables(template: string, variables: ResolvedVariables): string {
  return template.replace(VARIABLE_PATTERN, (match, key) => {
    if (key.startsWith('$')) {
      return resolveDynamicVariable(key) ?? match;
    }
    return variables[key] ?? match;
  });
}

export function extractVariableNames(template: string): string[] {
  const names: string[] = [];
  let match;
  while ((match = VARIABLE_PATTERN.exec(template)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  VARIABLE_PATTERN.lastIndex = 0; // Reset regex state
  return names;
}

export function hasVariables(template: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  const result = VARIABLE_PATTERN.test(template);
  VARIABLE_PATTERN.lastIndex = 0;
  return result;
}

/**
 * Injects auth into headers (and potentially the URL for api-key query params).
 * Returns the (possibly modified) URL.
 */
export function injectAuth(
  auth: RequestAuth | undefined,
  headers: Record<string, string>,
  url: string,
  variables: ResolvedVariables
): string {
  if (!auth || auth.type === 'none') return url;

  switch (auth.type) {
    case 'basic': {
      const username = resolveVariables(auth.basic?.username || '', variables);
      const password = resolveVariables(auth.basic?.password || '', variables);
      headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
      break;
    }
    case 'bearer': {
      const token = resolveVariables(auth.bearer?.token || '', variables);
      const prefix = resolveVariables(auth.bearer?.prefix || 'Bearer', variables);
      headers['Authorization'] = prefix + ' ' + token;
      break;
    }
    case 'api-key': {
      const key = resolveVariables(auth.apiKey?.key || '', variables);
      const value = resolveVariables(auth.apiKey?.value || '', variables);
      if (key) {
        if (auth.apiKey?.addTo === 'query') {
          const separator = url.includes('?') ? '&' : '?';
          url = url + separator + encodeURIComponent(key) + '=' + encodeURIComponent(value);
        } else {
          headers[key] = value;
        }
      }
      break;
    }
    case 'oauth2': {
      const accessToken = resolveVariables(auth.oauth2?.accessToken || '', variables);
      if (accessToken) {
        headers['Authorization'] = 'Bearer ' + accessToken;
      }
      break;
    }
  }

  return url;
}

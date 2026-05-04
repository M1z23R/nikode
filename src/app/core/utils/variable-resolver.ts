import { ResolvedVariables } from '../models/environment.model';
import { RequestAuth, CollectionItem, Collection } from '../models/collection.model';
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

/**
 * Walk the inheritance chain (item → folder ancestors, nearest first → collection)
 * and return the first concrete (non-inherit, non-undefined) auth found.
 *
 * `undefined` and `{ type: 'inherit' }` both signal "look further up the chain".
 * `{ type: 'none' }` is an explicit override that stops inheritance.
 */
export function resolveEffectiveAuth(
  itemAuth: RequestAuth | undefined,
  folderChainAuth: Array<RequestAuth | undefined>,
  collectionAuth: RequestAuth | undefined,
): RequestAuth | undefined {
  const chain = [itemAuth, ...folderChainAuth, collectionAuth];
  for (const a of chain) {
    if (!a) continue;
    if (a.type === 'inherit') continue;
    return a;
  }
  return undefined;
}

/**
 * Locate an item by id within a tree, returning the item itself plus the chain
 * of folder ancestors ordered nearest-first. Returns null if not found.
 */
export function findItemWithAncestors(
  items: CollectionItem[],
  itemId: string,
): { item: CollectionItem; folderChain: CollectionItem[] } | null {
  function walk(nodes: CollectionItem[], chain: CollectionItem[]): { item: CollectionItem; folderChain: CollectionItem[] } | null {
    for (const node of nodes) {
      if (node.id === itemId) {
        // chain is built top-down; reverse so nearest folder comes first
        return { item: node, folderChain: [...chain].reverse() };
      }
      if (node.type === 'folder' && node.items?.length) {
        const found = walk(node.items, [...chain, node]);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(items, []);
}

/**
 * Convenience: resolve the effective auth for a request id within a collection.
 */
export function resolveAuthForRequest(
  collection: Collection | undefined,
  requestId: string,
  inlineAuthOverride?: RequestAuth,
): RequestAuth | undefined {
  if (!collection) return inlineAuthOverride;
  const found = findItemWithAncestors(collection.items, requestId);
  const itemAuth = inlineAuthOverride ?? found?.item.auth;
  const folderAuths = (found?.folderChain ?? []).map(f => f.auth);
  return resolveEffectiveAuth(itemAuth, folderAuths, collection.auth);
}

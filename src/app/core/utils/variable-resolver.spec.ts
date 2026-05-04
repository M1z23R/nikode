import { describe, it, expect } from 'vitest';
import {
  resolveVariables,
  extractVariableNames,
  hasVariables,
  resolveEffectiveAuth,
  findItemWithAncestors,
  resolveAuthForRequest,
} from './variable-resolver';
import { Collection, CollectionItem, RequestAuth } from '../models/collection.model';

describe('variable-resolver', () => {
  describe('resolveVariables', () => {
    it('should replace a single variable', () => {
      const result = resolveVariables('Hello {{name}}', { name: 'World' });
      expect(result).toBe('Hello World');
    });

    it('should replace multiple different variables', () => {
      const result = resolveVariables('{{greeting}} {{name}}!', {
        greeting: 'Hello',
        name: 'World',
      });
      expect(result).toBe('Hello World!');
    });

    it('should replace the same variable multiple times', () => {
      const result = resolveVariables('{{x}} + {{x}} = 2{{x}}', { x: '1' });
      expect(result).toBe('1 + 1 = 21');
    });

    it('should leave unmatched variables unchanged', () => {
      const result = resolveVariables('{{known}} and {{unknown}}', { known: 'found' });
      expect(result).toBe('found and {{unknown}}');
    });

    it('should return original string if no variables match', () => {
      const result = resolveVariables('{{a}} {{b}}', {});
      expect(result).toBe('{{a}} {{b}}');
    });

    it('should return original string if no variables present', () => {
      const result = resolveVariables('plain text', { name: 'unused' });
      expect(result).toBe('plain text');
    });

    it('should handle empty string', () => {
      const result = resolveVariables('', { name: 'value' });
      expect(result).toBe('');
    });

    it('should handle variable at start of string', () => {
      const result = resolveVariables('{{start}} text', { start: 'Begin' });
      expect(result).toBe('Begin text');
    });

    it('should handle variable at end of string', () => {
      const result = resolveVariables('text {{end}}', { end: 'finish' });
      expect(result).toBe('text finish');
    });

    it('should handle empty variable value', () => {
      const result = resolveVariables('{{empty}}', { empty: '' });
      expect(result).toBe('');
    });

    it('should handle URL with variables', () => {
      const result = resolveVariables('{{baseUrl}}/api/{{version}}/users', {
        baseUrl: 'https://api.example.com',
        version: 'v1',
      });
      expect(result).toBe('https://api.example.com/api/v1/users');
    });

    it('should handle JSON body with variables', () => {
      const result = resolveVariables('{"token": "{{authToken}}"}', {
        authToken: 'abc123',
      });
      expect(result).toBe('{"token": "abc123"}');
    });

    it('should resolve $-prefixed dynamic variables', () => {
      const result = resolveVariables('ts={{$timestamp}}', {});
      expect(result).not.toBe('ts={{$timestamp}}');
      expect(result).toMatch(/^ts=\d+$/);
    });

    it('should resolve dynamic variables alongside regular variables', () => {
      const result = resolveVariables('{{host}}/{{$randomInt}}', { host: 'example.com' });
      expect(result).toMatch(/^example\.com\/\d+$/);
    });

    it('should leave unknown $-prefixed variables unchanged', () => {
      const result = resolveVariables('{{$unknown}}', {});
      expect(result).toBe('{{$unknown}}');
    });

    it('should not let user variables override dynamic variables ($ prefix is reserved)', () => {
      // Dynamic variables take precedence since they're checked first
      const result = resolveVariables('{{$timestamp}}', { $timestamp: 'user-value' });
      expect(result).not.toBe('user-value');
      expect(result).toMatch(/^\d+$/);
    });
  });

  describe('extractVariableNames', () => {
    it('should extract a single variable name', () => {
      const result = extractVariableNames('Hello {{name}}');
      expect(result).toEqual(['name']);
    });

    it('should extract multiple variable names', () => {
      const result = extractVariableNames('{{greeting}} {{name}}!');
      expect(result).toEqual(['greeting', 'name']);
    });

    it('should extract unique variable names only', () => {
      const result = extractVariableNames('{{x}} + {{x}} = {{y}}');
      expect(result).toEqual(['x', 'y']);
    });

    it('should return empty array if no variables', () => {
      const result = extractVariableNames('plain text');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const result = extractVariableNames('');
      expect(result).toEqual([]);
    });

    it('should handle variable names with underscores', () => {
      const result = extractVariableNames('{{my_variable}}');
      expect(result).toEqual(['my_variable']);
    });

    it('should handle variable names with numbers', () => {
      const result = extractVariableNames('{{var1}} {{var2}}');
      expect(result).toEqual(['var1', 'var2']);
    });

    it('should handle consecutive calls (regex state reset)', () => {
      extractVariableNames('{{a}}');
      const result = extractVariableNames('{{b}}');
      expect(result).toEqual(['b']);
    });

    it('should extract $-prefixed variable names', () => {
      const result = extractVariableNames('{{$timestamp}} and {{$randomInt}}');
      expect(result).toEqual(['$timestamp', '$randomInt']);
    });

    it('should extract mixed regular and $-prefixed variable names', () => {
      const result = extractVariableNames('{{host}}/{{$randomUUID}}');
      expect(result).toEqual(['host', '$randomUUID']);
    });
  });

  describe('hasVariables', () => {
    it('should return true if string contains a variable', () => {
      expect(hasVariables('Hello {{name}}')).toBe(true);
    });

    it('should return true if string contains multiple variables', () => {
      expect(hasVariables('{{a}} {{b}}')).toBe(true);
    });

    it('should return false if string has no variables', () => {
      expect(hasVariables('plain text')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasVariables('')).toBe(false);
    });

    it('should return false for malformed variables', () => {
      expect(hasVariables('{{invalid')).toBe(false);
      expect(hasVariables('invalid}}')).toBe(false);
      expect(hasVariables('{single}')).toBe(false);
    });

    it('should handle consecutive calls (regex state reset)', () => {
      hasVariables('{{a}}');
      expect(hasVariables('plain')).toBe(false);
    });

    it('should return true for $-prefixed variables', () => {
      expect(hasVariables('{{$timestamp}}')).toBe(true);
    });

    it('should return true for mixed regular and $-prefixed variables', () => {
      expect(hasVariables('{{host}} {{$randomInt}}')).toBe(true);
    });
  });

  describe('resolveEffectiveAuth', () => {
    const bearer: RequestAuth = { type: 'bearer', bearer: { token: 't', prefix: 'Bearer' } };
    const basic: RequestAuth = { type: 'basic', basic: { username: 'u', password: 'p' } };

    it('returns the request auth when it is concrete', () => {
      expect(resolveEffectiveAuth(bearer, [], basic)).toBe(bearer);
    });

    it('falls through to folder when request auth is inherit', () => {
      expect(resolveEffectiveAuth({ type: 'inherit' }, [bearer], basic)).toBe(bearer);
    });

    it('falls through to collection when request and all folders inherit', () => {
      expect(resolveEffectiveAuth({ type: 'inherit' }, [{ type: 'inherit' }, { type: 'inherit' }], basic)).toBe(basic);
    });

    it('treats undefined as inherit', () => {
      expect(resolveEffectiveAuth(undefined, [undefined], bearer)).toBe(bearer);
    });

    it('returns explicit none even when collection has auth (no inheritance)', () => {
      const none: RequestAuth = { type: 'none' };
      expect(resolveEffectiveAuth(none, [], bearer)).toBe(none);
    });

    it('returns undefined when nothing concrete in chain', () => {
      expect(resolveEffectiveAuth({ type: 'inherit' }, [{ type: 'inherit' }], { type: 'inherit' })).toBeUndefined();
    });

    it('walks folders in order (nearest first wins)', () => {
      const nearer: RequestAuth = { type: 'bearer', bearer: { token: 'near', prefix: 'Bearer' } };
      const further: RequestAuth = { type: 'bearer', bearer: { token: 'far', prefix: 'Bearer' } };
      // chain order: itemAuth, ...folderChainAuth (nearest first), collectionAuth
      expect(resolveEffectiveAuth({ type: 'inherit' }, [nearer, further], basic)).toBe(nearer);
    });
  });

  describe('findItemWithAncestors', () => {
    const tree: CollectionItem[] = [
      {
        id: 'f1',
        type: 'folder',
        name: 'Outer',
        items: [
          {
            id: 'f2',
            type: 'folder',
            name: 'Inner',
            items: [
              { id: 'r1', type: 'request', name: 'Req A' }
            ]
          },
          { id: 'r2', type: 'request', name: 'Req B' }
        ]
      }
    ];

    it('locates a deeply nested request and returns nearest-first folder chain', () => {
      const found = findItemWithAncestors(tree, 'r1');
      expect(found).not.toBeNull();
      expect(found!.item.id).toBe('r1');
      expect(found!.folderChain.map(f => f.id)).toEqual(['f2', 'f1']);
    });

    it('returns empty folderChain for top-level item', () => {
      const found = findItemWithAncestors(tree, 'f1');
      expect(found!.folderChain).toEqual([]);
    });

    it('returns null for missing id', () => {
      expect(findItemWithAncestors(tree, 'nope')).toBeNull();
    });
  });

  describe('resolveAuthForRequest', () => {
    const collectionBearer: RequestAuth = { type: 'bearer', bearer: { token: 'col', prefix: 'Bearer' } };
    const folderBasic: RequestAuth = { type: 'basic', basic: { username: 'u', password: 'p' } };

    function makeCollection(): Collection {
      return {
        name: 'X',
        version: '1.0.0',
        environments: [],
        activeEnvironmentId: '',
        auth: collectionBearer,
        items: [
          {
            id: 'folder1',
            type: 'folder',
            name: 'F',
            auth: folderBasic,
            items: [
              { id: 'req-a', type: 'request', name: 'A', auth: { type: 'inherit' } },
              { id: 'req-b', type: 'request', name: 'B', auth: { type: 'none' } },
            ]
          },
          { id: 'req-c', type: 'request', name: 'C', auth: { type: 'inherit' } },
        ],
      };
    }

    it('inherits from nearest folder for nested requests', () => {
      const auth = resolveAuthForRequest(makeCollection(), 'req-a');
      expect(auth).toBe(folderBasic);
    });

    it('honors explicit none on the request (no inheritance)', () => {
      const auth = resolveAuthForRequest(makeCollection(), 'req-b');
      expect(auth?.type).toBe('none');
    });

    it('inherits from collection when no folder has concrete auth', () => {
      const auth = resolveAuthForRequest(makeCollection(), 'req-c');
      expect(auth).toBe(collectionBearer);
    });

    it('uses inline override over the stored item.auth', () => {
      const override: RequestAuth = { type: 'bearer', bearer: { token: 'override', prefix: 'Bearer' } };
      const auth = resolveAuthForRequest(makeCollection(), 'req-a', override);
      expect(auth).toBe(override);
    });
  });
});

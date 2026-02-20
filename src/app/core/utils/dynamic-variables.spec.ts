import { describe, it, expect } from 'vitest';
import {
  isDynamicVariable,
  resolveDynamicVariable,
  getDynamicVariableDescription,
  DYNAMIC_VARIABLE_LIST,
} from './dynamic-variables';

describe('dynamic-variables', () => {
  describe('isDynamicVariable', () => {
    it('should return true for known dynamic variables', () => {
      expect(isDynamicVariable('$randomInt')).toBe(true);
      expect(isDynamicVariable('$randomFloat')).toBe(true);
      expect(isDynamicVariable('$randomString')).toBe(true);
      expect(isDynamicVariable('$randomUUID')).toBe(true);
      expect(isDynamicVariable('$timestamp')).toBe(true);
      expect(isDynamicVariable('$isoTimestamp')).toBe(true);
      expect(isDynamicVariable('$randomEmail')).toBe(true);
      expect(isDynamicVariable('$randomBool')).toBe(true);
    });

    it('should return false for unknown names', () => {
      expect(isDynamicVariable('randomInt')).toBe(false);
      expect(isDynamicVariable('$unknown')).toBe(false);
      expect(isDynamicVariable('myVar')).toBe(false);
    });
  });

  describe('resolveDynamicVariable', () => {
    it('$randomInt should return an integer between 0 and 1000', () => {
      for (let i = 0; i < 20; i++) {
        const result = resolveDynamicVariable('$randomInt')!;
        const num = Number(result);
        expect(Number.isInteger(num)).toBe(true);
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(1000);
      }
    });

    it('$randomFloat should return a float string with decimals', () => {
      for (let i = 0; i < 20; i++) {
        const result = resolveDynamicVariable('$randomFloat')!;
        const num = Number(result);
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(1);
        expect(result).toMatch(/^\d+\.\d{6}$/);
      }
    });

    it('$randomString should return a 16-character alphanumeric string', () => {
      for (let i = 0; i < 20; i++) {
        const result = resolveDynamicVariable('$randomString')!;
        expect(result).toHaveLength(16);
        expect(result).toMatch(/^[A-Za-z0-9]{16}$/);
      }
    });

    it('$randomUUID should return a valid UUID v4 format', () => {
      for (let i = 0; i < 10; i++) {
        const result = resolveDynamicVariable('$randomUUID')!;
        expect(result).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });

    it('$timestamp should return a numeric string', () => {
      const result = resolveDynamicVariable('$timestamp')!;
      const num = Number(result);
      expect(Number.isInteger(num)).toBe(true);
      expect(num).toBeGreaterThan(0);
    });

    it('$isoTimestamp should return a valid ISO date string', () => {
      const result = resolveDynamicVariable('$isoTimestamp')!;
      const date = new Date(result);
      expect(date.toISOString()).toBe(result);
    });

    it('$randomEmail should return a valid email format', () => {
      for (let i = 0; i < 20; i++) {
        const result = resolveDynamicVariable('$randomEmail')!;
        expect(result).toMatch(/^[a-z0-9]{8}@example\.com$/);
      }
    });

    it('$randomBool should return "true" or "false"', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const result = resolveDynamicVariable('$randomBool')!;
        expect(result === 'true' || result === 'false').toBe(true);
        results.add(result);
      }
      // With 50 iterations, we should see both values
      expect(results.size).toBe(2);
    });

    it('should return undefined for unknown variables', () => {
      expect(resolveDynamicVariable('$unknown')).toBeUndefined();
      expect(resolveDynamicVariable('notDynamic')).toBeUndefined();
    });
  });

  describe('getDynamicVariableDescription', () => {
    it('should return description for known variables', () => {
      expect(getDynamicVariableDescription('$randomInt')).toBe('Random integer between 0 and 1000');
      expect(getDynamicVariableDescription('$randomUUID')).toBe('Random UUID v4');
    });

    it('should return undefined for unknown variables', () => {
      expect(getDynamicVariableDescription('$unknown')).toBeUndefined();
    });
  });

  describe('DYNAMIC_VARIABLE_LIST', () => {
    it('should contain 8 entries', () => {
      expect(DYNAMIC_VARIABLE_LIST).toHaveLength(8);
    });

    it('each entry should have key and description', () => {
      for (const entry of DYNAMIC_VARIABLE_LIST) {
        expect(entry.key).toBeTruthy();
        expect(entry.key.startsWith('$')).toBe(true);
        expect(entry.description).toBeTruthy();
      }
    });
  });
});

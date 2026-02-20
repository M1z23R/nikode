const DYNAMIC_VARIABLES: Record<string, () => string> = {
  $randomInt: () => Math.floor(Math.random() * 1001).toString(),
  $randomFloat: () => Math.random().toFixed(6),
  $randomString: () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomUUID: () => crypto.randomUUID(),
  $timestamp: () => Math.floor(Date.now() / 1000).toString(),
  $isoTimestamp: () => new Date().toISOString(),
  $randomEmail: () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let user = '';
    for (let i = 0; i < 8; i++) {
      user += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${user}@example.com`;
  },
  $randomBool: () => (Math.random() < 0.5 ? 'true' : 'false'),
};

export const DYNAMIC_VARIABLE_LIST: { key: string; description: string }[] = [
  { key: '$randomInt', description: 'Random integer between 0 and 1000' },
  { key: '$randomFloat', description: 'Random float between 0 and 1' },
  { key: '$randomString', description: 'Random 16-character alphanumeric string' },
  { key: '$randomUUID', description: 'Random UUID v4' },
  { key: '$timestamp', description: 'Current Unix timestamp (seconds)' },
  { key: '$isoTimestamp', description: 'Current ISO 8601 timestamp' },
  { key: '$randomEmail', description: 'Random email address' },
  { key: '$randomBool', description: 'Random boolean (true/false)' },
];

export function isDynamicVariable(name: string): boolean {
  return name in DYNAMIC_VARIABLES;
}

export function resolveDynamicVariable(name: string): string | undefined {
  return DYNAMIC_VARIABLES[name]?.();
}

export function getDynamicVariableDescription(name: string): string | undefined {
  return DYNAMIC_VARIABLE_LIST.find(d => d.key === name)?.description;
}

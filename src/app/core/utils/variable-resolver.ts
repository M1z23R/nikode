import { ResolvedVariables } from '../models/environment.model';

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function resolveVariables(template: string, variables: ResolvedVariables): string {
  return template.replace(VARIABLE_PATTERN, (match, key) => {
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

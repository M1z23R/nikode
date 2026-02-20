import { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';

// nk.request.* completions
const requestCompletions: Completion[] = [
  { label: 'method', type: 'property', info: 'HTTP method (GET, POST, etc.)', detail: 'string' },
  { label: 'url', type: 'property', info: 'Request URL', detail: 'string' },
  { label: 'headers', type: 'property', info: 'Request headers', detail: 'Record<string, string>' },
  { label: 'body', type: 'property', info: 'Request body', detail: 'string | undefined' },
];

// nk.response.* completions
const responseCompletions: Completion[] = [
  { label: 'status', type: 'property', info: 'HTTP status code', detail: 'number' },
  { label: 'headers', type: 'property', info: 'Response headers', detail: 'Record<string, string>' },
  { label: 'body', type: 'property', info: 'Response body', detail: 'string' },
  { label: 'time', type: 'property', info: 'Response time in milliseconds', detail: 'number' },
];

// nk.* completions
const nkCompletions: Completion[] = [
  {
    label: 'getEnv',
    type: 'function',
    info: 'Get an environment variable value',
    detail: '(key: string) => string | undefined',
    apply: 'getEnv("")',
  },
  {
    label: 'setEnv',
    type: 'function',
    info: 'Set an environment variable value',
    detail: '(key: string, value: string) => void',
    apply: 'setEnv("", "")',
  },
  {
    label: 'getVar',
    type: 'function',
    info: 'Get a collection variable value',
    detail: '(key: string) => string | undefined',
    apply: 'getVar("")',
  },
  {
    label: 'setVar',
    type: 'function',
    info: 'Set a collection variable value',
    detail: '(key: string, value: string) => void',
    apply: 'setVar("", "")',
  },
  {
    label: 'test',
    type: 'function',
    info: 'Define a test with a name and assertion function',
    detail: '(name: string, fn: () => void) => void',
    apply: 'test("", () => {\n  \n})',
  },
  {
    label: 'assert',
    type: 'function',
    info: 'Assert a condition is true, throws if false',
    detail: '(condition: boolean, message?: string) => void',
    apply: 'assert()',
  },
  {
    label: 'request',
    type: 'variable',
    info: 'The current request object',
    detail: '{ method, url, headers, body }',
  },
  {
    label: 'response',
    type: 'variable',
    info: 'The response object (post-response only)',
    detail: '{ status, headers, body, time }',
  },
  {
    label: 'iteration',
    type: 'property',
    info: 'Current polling iteration index (0-based)',
    detail: 'number',
  },
  {
    label: 'stopPolling',
    type: 'function',
    info: 'Stop the polling loop after current iteration',
    detail: '() => void',
    apply: 'stopPolling()',
  },
];

// console.* completions
const consoleCompletions: Completion[] = [
  {
    label: 'log',
    type: 'function',
    info: 'Log a message to the console',
    detail: '(...args: any[]) => void',
    apply: 'log()',
  },
  {
    label: 'warn',
    type: 'function',
    info: 'Log a warning to the console',
    detail: '(...args: any[]) => void',
    apply: 'warn()',
  },
  {
    label: 'error',
    type: 'function',
    info: 'Log an error to the console',
    detail: '(...args: any[]) => void',
    apply: 'error()',
  },
];

// Top-level completions
const topLevelCompletions: Completion[] = [
  {
    label: 'nk',
    type: 'namespace',
    info: 'Nikode scripting API',
    detail: 'namespace',
  },
  {
    label: 'console',
    type: 'namespace',
    info: 'Console logging',
    detail: 'namespace',
  },
];

export function scriptCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // Check for "nk.request." prefix
  const requestMatch = textBefore.match(/\bnk\.request\.(\w*)$/);
  if (requestMatch) {
    return {
      from: context.pos - requestMatch[1].length,
      options: requestCompletions,
      validFor: /^\w*$/,
    };
  }

  // Check for "nk.response." prefix
  const responseMatch = textBefore.match(/\bnk\.response\.(\w*)$/);
  if (responseMatch) {
    return {
      from: context.pos - responseMatch[1].length,
      options: responseCompletions,
      validFor: /^\w*$/,
    };
  }

  // Check for "nk." prefix
  const nkMatch = textBefore.match(/\bnk\.(\w*)$/);
  if (nkMatch) {
    return {
      from: context.pos - nkMatch[1].length,
      options: nkCompletions,
      validFor: /^\w*$/,
    };
  }

  // Check for "console." prefix
  const consoleMatch = textBefore.match(/\bconsole\.(\w*)$/);
  if (consoleMatch) {
    return {
      from: context.pos - consoleMatch[1].length,
      options: consoleCompletions,
      validFor: /^\w*$/,
    };
  }

  // Top-level completions
  const word = context.matchBefore(/\w+/);
  if (!word && !context.explicit) return null;

  // Build full completions with prefixes for top-level
  const allCompletions: Completion[] = [
    ...topLevelCompletions,
    ...nkCompletions.map(c => ({
      ...c,
      label: `nk.${c.label}`,
      apply: `nk.${c.apply ?? c.label}`,
    })),
    ...consoleCompletions.map(c => ({
      ...c,
      label: `console.${c.label}`,
      apply: `console.${c.apply ?? c.label}`,
    })),
  ];

  return {
    from: word?.from ?? context.pos,
    options: allCompletions,
    validFor: /^[\w.]*$/,
  };
}

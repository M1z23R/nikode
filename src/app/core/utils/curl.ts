import { HttpMethod, KeyValue, RequestAuth, RequestBody } from '../models/collection.model';
import { ProxyRequest } from '../models/request.model';

export interface ParsedCurl {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  body: RequestBody;
  params: KeyValue[];
  auth?: RequestAuth;
}

export type CurlParseResult =
  | { success: true; data: ParsedCurl }
  | { success: false; error: string };

/**
 * Generates a cURL command from a ProxyRequest.
 */
export function generateCurl(request: ProxyRequest): string {
  const parts: string[] = ['curl'];

  // Method (only add if not GET)
  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  // URL (escape single quotes)
  parts.push(`'${escapeShellSingleQuote(request.url)}'`);

  // Headers
  for (const [key, value] of Object.entries(request.headers)) {
    parts.push(`-H '${escapeShellSingleQuote(key)}: ${escapeShellSingleQuote(value)}'`);
  }

  // Body
  if (request.body) {
    parts.push(`-d '${escapeShellSingleQuote(request.body)}'`);
  }

  return parts.join(' \\\n  ');
}

/**
 * Parses a cURL command into request components.
 */
export function parseCurl(command: string): CurlParseResult {
  try {
    // Normalize the command: remove line continuations and extra whitespace
    const normalized = command
      .replace(/\\\s*\n/g, ' ')  // Remove line continuations
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Verify it starts with curl
    if (!normalized.toLowerCase().startsWith('curl ')) {
      return { success: false, error: 'Command must start with "curl"' };
    }

    // Tokenize the command (respecting quoted strings)
    const tokens = tokenize(normalized.slice(5)); // Skip 'curl '

    let method: HttpMethod = 'GET';
    let url = '';
    const headers: KeyValue[] = [];
    let bodyContent = '';
    let bodyType: 'none' | 'json' | 'raw' | 'form-data' | 'x-www-form-urlencoded' = 'none';
    const formEntries: KeyValue[] = [];
    let auth: RequestAuth | undefined;

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      if (token === '-X' || token === '--request') {
        // Method
        i++;
        if (i >= tokens.length) {
          return { success: false, error: 'Missing method after -X' };
        }
        const m = tokens[i].toUpperCase();
        if (isHttpMethod(m)) {
          method = m;
        } else {
          return { success: false, error: `Invalid HTTP method: ${tokens[i]}` };
        }
      } else if (token === '-H' || token === '--header') {
        // Header
        i++;
        if (i >= tokens.length) {
          return { success: false, error: 'Missing header value after -H' };
        }
        const header = parseHeader(tokens[i]);
        if (header) {
          headers.push({ key: header.key, value: header.value, enabled: true });
        }
      } else if (token === '-d' || token === '--data' || token === '--data-raw') {
        // Body data
        i++;
        if (i >= tokens.length) {
          return { success: false, error: 'Missing data after -d' };
        }
        bodyContent = tokens[i];
        // Detect JSON
        if (looksLikeJson(bodyContent)) {
          bodyType = 'json';
        } else {
          bodyType = 'raw';
        }
        // Default to POST if method wasn't explicitly set
        if (method === 'GET') {
          method = 'POST';
        }
      } else if (token === '--data-urlencode') {
        // URL-encoded data
        i++;
        if (i >= tokens.length) {
          return { success: false, error: 'Missing data after --data-urlencode' };
        }
        const entry = parseUrlEncodedEntry(tokens[i]);
        if (entry) {
          formEntries.push({ key: entry.key, value: entry.value, enabled: true });
          bodyType = 'x-www-form-urlencoded';
        }
        if (method === 'GET') {
          method = 'POST';
        }
      } else if (token === '-F' || token === '--form') {
        // Form data
        i++;
        if (i >= tokens.length) {
          return { success: false, error: 'Missing form data after -F' };
        }
        const entry = parseFormEntry(tokens[i]);
        if (entry) {
          formEntries.push({ key: entry.key, value: entry.value, enabled: true });
          bodyType = 'form-data';
        }
        if (method === 'GET') {
          method = 'POST';
        }
      } else if (token === '-u' || token === '--user') {
        // Basic auth: -u user:pass
        i++;
        if (i < tokens.length) {
          const credentials = tokens[i];
          const colonIdx = credentials.indexOf(':');
          const username = colonIdx >= 0 ? credentials.slice(0, colonIdx) : credentials;
          const password = colonIdx >= 0 ? credentials.slice(colonIdx + 1) : '';
          auth = { type: 'basic', basic: { username, password } };
        }
      } else if (token === '--oauth2-bearer') {
        // Bearer token: --oauth2-bearer <token>
        i++;
        if (i < tokens.length) {
          auth = { type: 'bearer', bearer: { token: tokens[i], prefix: 'Bearer' } };
        }
      } else if (token.startsWith('-')) {
        // Skip other flags (and their values if they look like they take one)
        // Common flags that take values
        const flagsWithValues = ['-o', '--output', '-A', '--user-agent',
          '-e', '--referer', '-b', '--cookie', '-c', '--cookie-jar', '--connect-timeout',
          '-m', '--max-time', '-w', '--write-out', '-T', '--upload-file'];
        if (flagsWithValues.includes(token) && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          i++; // Skip the value too
        }
      } else if (!url && !token.startsWith('-')) {
        // URL (first non-flag argument)
        url = token;
      }

      i++;
    }

    if (!url) {
      return { success: false, error: 'No URL found in curl command' };
    }

    // Extract query params from URL
    const { baseUrl, params } = extractQueryParams(url);

    // Build body
    let body: RequestBody;
    if (bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') {
      body = { type: bodyType, entries: formEntries };
    } else if (bodyType === 'json' || bodyType === 'raw') {
      body = { type: bodyType, content: bodyContent };
    } else {
      body = { type: 'none' };
    }

    return {
      success: true,
      data: {
        method,
        url: baseUrl,
        headers,
        body,
        params,
        ...(auth ? { auth } : {})
      }
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to parse curl command'
    };
  }
}

/**
 * Escapes single quotes for shell commands.
 */
function escapeShellSingleQuote(str: string): string {
  // In single-quoted shell strings, we need to end the quote, add an escaped quote, then start again
  // 'text' -> 'te'\''xt' (to include a single quote)
  return str.replace(/'/g, "'\\''");
}

/**
 * Tokenizes a command string respecting quoted strings.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inQuote !== "'") {
      // Backslash escapes next char (except in single quotes)
      escapeNext = true;
      continue;
    }

    if (inQuote) {
      if (char === inQuote) {
        // End quote
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      // Start quote
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      // Whitespace - end current token
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  // Add final token
  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parses a header string like "Content-Type: application/json".
 */
function parseHeader(headerStr: string): { key: string; value: string } | null {
  const colonIndex = headerStr.indexOf(':');
  if (colonIndex === -1) return null;

  const key = headerStr.slice(0, colonIndex).trim();
  const value = headerStr.slice(colonIndex + 1).trim();

  return { key, value };
}

/**
 * Parses a form entry like "key=value".
 */
function parseFormEntry(entryStr: string): { key: string; value: string } | null {
  const eqIndex = entryStr.indexOf('=');
  if (eqIndex === -1) return null;

  const key = entryStr.slice(0, eqIndex);
  let value = entryStr.slice(eqIndex + 1);

  // Handle file references (@file or <file)
  if (value.startsWith('@') || value.startsWith('<')) {
    value = value.slice(1);
  }

  return { key, value };
}

/**
 * Parses a URL-encoded entry like "key=value".
 */
function parseUrlEncodedEntry(entryStr: string): { key: string; value: string } | null {
  const eqIndex = entryStr.indexOf('=');
  if (eqIndex === -1) {
    // Just a key, no value
    return { key: entryStr, value: '' };
  }

  const key = entryStr.slice(0, eqIndex);
  const value = entryStr.slice(eqIndex + 1);

  return { key, value };
}

/**
 * Extracts query parameters from a URL.
 */
function extractQueryParams(url: string): { baseUrl: string; params: KeyValue[] } {
  try {
    const urlObj = new URL(url);
    const params: KeyValue[] = [];

    urlObj.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });

    // Remove query string from URL
    urlObj.search = '';
    const baseUrl = urlObj.toString();

    return { baseUrl, params };
  } catch {
    // If URL parsing fails, try manual extraction
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      return { baseUrl: url, params: [] };
    }

    const baseUrl = url.slice(0, queryIndex);
    const queryString = url.slice(queryIndex + 1);
    const params: KeyValue[] = [];

    for (const pair of queryString.split('&')) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        params.push({ key: pair, value: '', enabled: true });
      } else {
        params.push({
          key: decodeURIComponent(pair.slice(0, eqIndex)),
          value: decodeURIComponent(pair.slice(eqIndex + 1)),
          enabled: true
        });
      }
    }

    return { baseUrl, params };
  }
}

/**
 * Checks if a string looks like JSON.
 */
function looksLikeJson(str: string): boolean {
  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

/**
 * Type guard for HTTP methods.
 */
function isHttpMethod(method: string): method is HttpMethod {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method);
}

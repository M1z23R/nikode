export type ContentCategory = 'json' | 'html' | 'xml' | 'image' | 'text' | 'binary';

export interface ParsedContentType {
  type: string;
  subtype: string;
  charset: string | null;
  fullMime: string;
}

export function parseContentType(header: string | null | undefined): ParsedContentType {
  if (!header) {
    return { type: '', subtype: '', charset: null, fullMime: '' };
  }

  const parts = header.split(';').map((p) => p.trim());
  const [mimeType, ...params] = parts;
  const [type, subtype] = mimeType.split('/');

  let charset: string | null = null;
  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim());
    if (key.toLowerCase() === 'charset') {
      charset = value.replace(/['"]/g, '');
    }
  }

  return {
    type: type || '',
    subtype: subtype || '',
    charset,
    fullMime: mimeType,
  };
}

export function categorizeContentType(contentType: ParsedContentType): ContentCategory {
  const { type, subtype } = contentType;

  // JSON
  if (type === 'application' && subtype === 'json') return 'json';
  if (subtype.endsWith('+json')) return 'json';

  // HTML
  if (type === 'text' && subtype === 'html') return 'html';
  if (type === 'application' && subtype === 'xhtml+xml') return 'html';

  // XML
  if (type === 'text' && subtype === 'xml') return 'xml';
  if (type === 'application' && subtype === 'xml') return 'xml';
  if (subtype.endsWith('+xml') && subtype !== 'xhtml+xml') return 'xml';

  // Images
  if (type === 'image') return 'image';

  // Text types
  if (type === 'text') return 'text';

  // Common text application types
  if (type === 'application') {
    const textSubtypes = ['javascript', 'x-javascript', 'ecmascript'];
    if (textSubtypes.includes(subtype)) return 'text';
  }

  // Everything else is binary
  return 'binary';
}

export function getContentCategory(headers: Record<string, string>): ContentCategory {
  const contentTypeHeader = headers['content-type'] || headers['Content-Type'] || '';
  const parsed = parseContentType(contentTypeHeader);
  return categorizeContentType(parsed);
}

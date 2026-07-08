const SENSITIVE_KEYS = [
  'password',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'secret'
];

/**
 * Recursively redacts sensitive values from an object before logging or saving.
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const sanitized = { ...obj };
  for (const [key, value] of Object.entries(sanitized)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    }
  }
  return sanitized;
}

/**
 * Strips Bearer tokens and Basic auth credentials from raw string outputs.
 */
export function sanitizeText(text: string): string {
  if (!text) return text;
  
  let sanitized = text.replace(/(Bearer\s+)[a-zA-Z0-9\-\._~+/]+=*/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(Basic\s+)[a-zA-Z0-9\-\._~+/]+=*/gi, '$1[REDACTED]');
  
  return sanitized;
}

export function safeParseJSON<T = unknown>(val: string | null | undefined, fallback: unknown = null): T {
  if (!val) return fallback as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback as T;
  }
}

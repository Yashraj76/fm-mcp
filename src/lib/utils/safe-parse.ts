export function safeParseJSON<T = any>(val: string | null | undefined, fallback: any = null): T {
  if (!val) return fallback as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback as T;
  }
}

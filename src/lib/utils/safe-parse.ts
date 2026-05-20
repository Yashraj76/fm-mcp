export function safeParseJSON(val: string | null | undefined, fallback: any = null): any {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

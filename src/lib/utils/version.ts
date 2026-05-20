// Increment semver patch (1.0.0 → 1.0.1)
export function incrementVersion(version: string): string {
  const parts = (version ?? '1.0.0').split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join('.');
}

// Increment minor version (1.0.3 → 1.1.0) — for significant changes
export function incrementMinorVersion(version: string): string {
  const parts = (version ?? '1.0.0').split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  parts[1] = (parts[1] ?? 0) + 1;
  parts[2] = 0;
  return parts.join('.');
}

// Strip any pre-release suffix (e.g. "-beta", "-alpha.1", "-rc.3") before parsing.
// Pre-release tags can contain dots (1.0.0-alpha.1), so we must split on '-' first
// rather than relying on parseInt to stop at '-', which would not handle the extra dots.
function parseVersionParts(version: string): [number, number, number] {
  const base = (version ?? '1.0.0').split('-')[0]
  const raw = base.split('.').map(p => parseInt(p, 10) || 0)
  return [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0]
}

// Increment semver patch (1.0.0 → 1.0.1)
export function incrementVersion(version: string): string {
  const [major, minor, patch] = parseVersionParts(version)
  return `${major}.${minor}.${patch + 1}`
}

// Increment minor version (1.0.3 → 1.1.0) — for significant changes
export function incrementMinorVersion(version: string): string {
  const [major, minor] = parseVersionParts(version)
  return `${major}.${minor + 1}.0`
}

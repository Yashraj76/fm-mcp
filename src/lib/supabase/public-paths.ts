// Paths that never require a Supabase session check in middleware.
// These pages must render even when Supabase is unavailable.
const AUTH_PAGE_PREFIXES = ['/login', '/signup', '/forgot-password', '/update-password', '/auth'];

export function isAuthOrPublicPath(pathname: string): boolean {
  return AUTH_PAGE_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/')
  );
}

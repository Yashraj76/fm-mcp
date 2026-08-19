import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface SessionUser {
  id: string;
  email?: string;
}

// getClaims() verifies the JWT locally (cached JWKS) for projects using
// asymmetric signing keys, avoiding the auth.getUser() network round-trip on
// every request. Projects still on a symmetric (legacy) secret transparently
// fall back to the same server-verification getUser() does — never a
// regression, only a possible speedup once asymmetric keys are enabled.
function toSessionUser(claims: { sub?: string; email?: string } | null | undefined): SessionUser | null {
  if (!claims?.sub) return null;
  return { id: claims.sub, email: claims.email };
}

// Use in Server Components and Route Handlers
// Returns user or null (does NOT redirect)
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return toSessionUser(data?.claims);
}

// Use in protected layouts and API routes
// Returns user or redirects to /login
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

// Use in API Route Handlers (cannot use redirect() in API routes)
// Returns { user, error }
export async function getUserFromRequest() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return { user: toSessionUser(data?.claims), error };
}

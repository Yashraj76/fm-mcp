import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

// Use in Server Components and Route Handlers
// Returns user or null (does NOT redirect)
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

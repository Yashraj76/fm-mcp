import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthOrPublicPath } from './public-paths';

// Maximum time (ms) to wait for Supabase auth.getUser() inside middleware.
// Prevents MIDDLEWARE_INVOCATION_TIMEOUT on Vercel when Supabase is slow.
const GETUSER_TIMEOUT_MS = 5_000;

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are protected by withAuth() in each route handler.
  // Middleware does not need to check sessions here — and must not, because
  // any session-refresh cookie writes from the middleware response are ignored
  // by the actual API response anyway.
  if (pathname.startsWith('/api')) {
    return NextResponse.next({ request });
  }

  // Auth/public pages render without a session. Skipping getUser() here means
  // /login and /signup are always fast, even if Supabase is temporarily slow.
  if (isAuthOrPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  // Protected app page — verify the session and redirect to /login if missing.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    // Env vars missing — redirect to login. The login page itself will surface
    // the misconfiguration clearly when users try to sign in.
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Wrap getUser() in a timeout so a slow or unreachable Supabase instance
  // cannot cause MIDDLEWARE_INVOCATION_TIMEOUT on Vercel.
  let user: { id: string } | null = null;
  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('supabase-auth-timeout')), GETUSER_TIMEOUT_MS)
      ),
    ]);
    user = data.user;
  } catch {
    // Timed out or network error — treat as unauthenticated.
    // Protected pages redirect to /login; users can retry after Supabase recovers.
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

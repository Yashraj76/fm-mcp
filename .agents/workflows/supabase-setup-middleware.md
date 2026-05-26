---
description: # Workflow 19: Supabase Setup via MCP + Client & Middleware Config
---

## Overview
Use the Supabase MCP server to set up the project, then wire the Supabase clients and Next.js middleware. This is the foundation everything else depends on.

---

## Step 1: Use Supabase MCP to Set Up the Project

Your AI coding agent connects to the Supabase MCP server during development. Add to your agent's MCP config:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

Then ask your agent to run these tasks via MCP tools:

```
1. List my Supabase projects → verify the correct project is selected
2. Get the project API keys → copy NEXT_PUBLIC_SUPABASE_URL and publishable key to .env.local
3. Check auth configuration → confirm "Enable email confirmations" is ON
4. Get the project's Site URL setting → confirm it matches NEXT_PUBLIC_APP_URL
5. Run this SQL to verify auth schema is ready:
   SELECT * FROM auth.users LIMIT 1;
```

If the project does not exist yet, ask the agent:
```
Create a new Supabase project named "filemaker-mcp-platform" in my organization
```

---

## Step 2: Install Packages

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

## Step 3: Supabase Browser Client

**File**: `src/lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

---

## Step 4: Supabase Server Client

**File**: `src/lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies — proxy handles this
          }
        },
      },
    }
  );
}
```

---

## Step 5: Proxy (Session Refresh)

**File**: `src/lib/supabase/proxy.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
    }
  );

  // IMPORTANT: always use getClaims() not getSession() on server
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/auth');

  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  // Redirect unauthenticated users to login (except auth pages and API routes)
  if (!user && !isAuthPage && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthPage && !request.nextUrl.pathname.startsWith('/auth/confirm')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

---

## Step 6: Next.js Middleware

**File**: `src/middleware.ts` (at project root level)

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

## Step 7: Auth Helper — Get Current User

**File**: `src/lib/auth/get-user.ts`

```typescript
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
```

---

## Step 8: Auth Confirmation Route Handler

**File**: `src/app/auth/confirm/route.ts`

```typescript
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login with error on failure
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
```

---

## Step 9: Supabase Dashboard — Email Template (must do manually)

In the Supabase dashboard → Auth → Email Templates → **Confirm signup**:

Change:
```
{{ .ConfirmationURL }}
```
To:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

This routes confirmation clicks through your Next.js handler instead of Supabase's default redirect.

Also set:
- **Site URL**: `https://your-app.vercel.app` (production) — or add `http://localhost:3000` to **Redirect URLs** list for local dev

---

## Step 10: Protected Layout

**File**: `src/app/(protected)/layout.tsx`

```typescript
import { requireUser } from '@/lib/auth/get-user';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /login if no session — never renders children for unauth users
  const user = await requireUser();

  return (
    <div>
      {/* Pass user to children via context or just render */}
      {children}
    </div>
  );
}
```
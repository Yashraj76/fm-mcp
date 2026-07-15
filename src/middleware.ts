import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { classifyRequest, checkRateLimit } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  const ip = extractIp(request);
  const tier = classifyRequest(request.nextUrl.pathname, request.method);

  if (tier !== 'none' && ip) {
    try {
      const { allowed, retryAfterSeconds } = await checkRateLimit(ip, tier);
      if (!allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many requests. Please slow down.',
            code: 'RATE_LIMITED',
            retryAfter: retryAfterSeconds,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfterSeconds),
              'Content-Type': 'application/json',
            },
          },
        );
      }
    } catch (err) {
      // Rate limiting must never break the app. Log safely and let the
      // request through rather than failing the whole app on an unexpected
      // rate-limiter error.
      console.error('[kilink] rate-limit middleware error, allowing request through:', err);
    }
  }

  return updateSession(request);
}

/**
 * Extract the real client IP, preferring Caddy / reverse-proxy headers.
 * Returns an empty string if the IP cannot be determined; callers skip
 * rate limiting in that case to avoid false positives.
 */
function extractIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  // req.ip is available in Vercel deployments and Next.js standalone
  const ip = (req as NextRequest & { ip?: string }).ip;
  return ip ?? '';
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

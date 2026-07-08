import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { classifyRequest, checkRateLimit, RateLimitConfigError } from '@/lib/rate-limit';

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
      if (err instanceof RateLimitConfigError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Rate limiter is not configured correctly for this environment.',
            code: err.code,
          },
          { status: 500 },
        );
      }
      // Other unexpected errors — let the request through rather than blocking all traffic.
      // The error was already logged inside checkRateLimit.
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

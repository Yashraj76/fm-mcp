import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import {
  classifyRequest,
  checkRateLimit,
  extractClientIp,
  parseTrustedProxyCount,
  rateLimitFailureResult,
} from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  // Derive the client IP from a trusted position — platform IP first, then
  // the X-Forwarded-For entry contributed by our own proxy (right-most after
  // TRUSTED_PROXY_COUNT hops), never the client-spoofable left-most entry.
  const ip = extractClientIp({
    platformIp: (request as NextRequest & { ip?: string }).ip,
    forwardedFor: request.headers.get('x-forwarded-for'),
    realIp: request.headers.get('x-real-ip'),
    trustedProxyCount: parseTrustedProxyCount(process.env.TRUSTED_PROXY_COUNT),
  });
  const tier = classifyRequest(request.nextUrl.pathname, request.method);

  if (tier !== 'none' && ip) {
    let allowed = true;
    let retryAfterSeconds = 0;
    try {
      ({ allowed, retryAfterSeconds } = await checkRateLimit(ip, tier));
    } catch (err) {
      // checkRateLimit handles backend errors itself; this is a last-resort
      // guard. Auth fails closed (brute-force protection must not silently
      // disappear); other tiers fail open so an unexpected limiter bug can't
      // take down the app.
      console.error('[kilink] rate-limit middleware error:', err);
      ({ allowed, retryAfterSeconds } = rateLimitFailureResult(tier));
    }
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
  }

  return updateSession(request);
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

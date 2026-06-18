import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  // Determine the correct public origin
  let targetOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!targetOrigin) {
    const host = request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    targetOrigin = `${proto}://${host}`;
  }

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      const redirectUrl = new URL(next, targetOrigin);
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Return to login with error on failure
  const errorUrl = new URL('/login?error=confirmation_failed', targetOrigin);
  return NextResponse.redirect(errorUrl.toString());
}

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { passcode } = await req.json();

    if (passcode === 'Kibiz2026!') {
      const response = NextResponse.json({ success: true });
      
      response.cookies.set('auth_token', passcode, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      });
      
      return response;
    }

    return NextResponse.json(
      { success: false, error: 'Invalid passcode' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

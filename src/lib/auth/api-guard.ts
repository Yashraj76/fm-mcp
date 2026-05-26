import { NextResponse } from 'next/server';
import { getUserFromRequest } from './get-user';

export type AuthedHandler = (
  req: any,
  context: { params: any; userId: string }
) => Promise<Response>;

// Wraps a route handler with auth check
// Returns 401 if not authenticated, otherwise injects userId into context
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, context?: any) => {
    const { user, error } = await getUserFromRequest();

    if (!user || error) {
      return NextResponse.json(
        { success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }

    const rawParams = context?.params;
    const resolvedParams = rawParams instanceof Promise ? await rawParams : (rawParams || {});

    return handler(req, { params: resolvedParams, userId: user.id });
  };
}

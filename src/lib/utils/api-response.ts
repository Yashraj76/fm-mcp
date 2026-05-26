import { NextResponse } from 'next/server';

/**
 * Standard API Success Response
 */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Standard API Error Response
 */
export function apiError(error: string, code: string, status = 500, details?: any) {
  return NextResponse.json(
    { success: false, error, code, details },
    { status }
  );
}

/**
 * Common Error Helpers
 */

export function apiValidationFailed(details: any) {
  return apiError('Validation failed', 'VALIDATION_ERROR', 400, details);
}

export function apiNotFound(msg = 'Resource not found') {
  return apiError(msg, 'NOT_FOUND', 404);
}

export function apiUnauthorized(msg = 'Unauthorized') {
  return apiError(msg, 'UNAUTHORIZED', 401);
}

export function apiForbidden(msg = 'Forbidden') {
  return apiError(msg, 'FORBIDDEN', 403);
}

export function apiServerError(msg = 'Internal server error') {
  return apiError(msg, 'SERVER_ERROR', 500);
}

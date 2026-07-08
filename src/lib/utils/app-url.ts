/**
 * Typed error for a missing NEXT_PUBLIC_APP_URL in production.
 * Callers can catch this specifically and return a user-visible config error.
 */
export class AppUrlConfigError extends Error {
  constructor() {
    super(
      'NEXT_PUBLIC_APP_URL is not set. ' +
      'Add this environment variable to your deployment with the public base URL ' +
      'of this app (e.g. https://your-app.vercel.app). ' +
      'Without it, MCP endpoint URLs cannot be generated correctly.'
    )
    this.name = 'AppUrlConfigError'
  }
}

/**
 * Returns the public-facing base URL for this deployment.
 *
 * - If NEXT_PUBLIC_APP_URL is set: returned as-is (all environments).
 * - If unset in development (NODE_ENV !== 'production'): falls back to
 *   http://localhost:3000 for local convenience.
 * - If unset in production: throws AppUrlConfigError so callers can surface
 *   a clear, actionable configuration error rather than silently serving
 *   localhost URLs to real users.
 *
 * The `nodeEnv` parameter exists only to make unit-testing possible without
 * modifying the real process.env.NODE_ENV.
 */
export function getPublicAppUrl(nodeEnv = process.env.NODE_ENV): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured

  if (nodeEnv === 'production') {
    throw new AppUrlConfigError()
  }

  // Development / test fallback — convenient for local work
  return 'http://localhost:3000'
}

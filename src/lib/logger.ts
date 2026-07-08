import pino from 'pino'

// Paths redacted from all log entries — never lands in log aggregator
const REDACT_PATHS = [
  // Top-level credential fields
  'password', 'passwd', 'secret', 'clientSecret',
  'apiKey', 'api_key', 'token', 'accessToken', 'refreshToken',
  'authorization', 'connectionString', 'dsn',
  // Nested under any object
  '*.password', '*.passwd', '*.secret', '*.clientSecret',
  '*.apiKey', '*.api_key', '*.token', '*.accessToken', '*.refreshToken',
  '*.authorization', '*.connectionString', '*.dsn',
  // HTTP headers
  'req.headers.authorization', 'req.headers.cookie',
  '*.headers.authorization', '*.headers.cookie',
]

export const logger = pino({
  name: 'kilink',
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  serializers: {
    // Serialize Error objects to { type, message, stack } — never raw object
    err: pino.stdSerializers.err,
  },
  base: { env: process.env.NODE_ENV },
  // Timestamp in ISO-8601 for log aggregators (Vercel, Datadog, etc.)
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Convenience: safe error extraction for when you need just the fields, not the full pino call
export function serializeErr(err: unknown): { message: string; code?: string; name?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code: (err as NodeJS.ErrnoException).code,
    }
  }
  return { message: String(err) }
}

# Error Monitoring Guide

kilink writes structured JSON logs via pino (see `src/lib/logger.ts`). For production deployments, we recommend adding a dedicated error monitoring service to capture exceptions, track error rates, and alert on regressions.

---

## Recommended: Sentry

[Sentry](https://sentry.io) is the most widely-used error monitoring solution for Next.js applications and integrates with the App Router natively.

### Installation

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard creates `sentry.client.config.ts`, `sentry.server.config.ts`, and patches `next.config.ts` automatically.

### Minimum viable config

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Prevent sensitive data from leaving the server
  beforeSend(event) {
    // Strip request bodies — they may contain FileMaker credentials
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
    }
    return event
  },
})
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
})
```

### Environment variables

```bash
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>   # for source map upload during build
SENTRY_ORG=<your-org>
SENTRY_PROJECT=kilink
```

### Source maps

Source maps let Sentry show original TypeScript in stack traces. In `next.config.ts`, enable:

```typescript
// next.config.ts
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = { /* existing config */ }

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
})
```

---

## Alternative: Highlight.io

[Highlight](https://highlight.io) provides session replay in addition to error tracking and has a generous free tier.

```bash
npm install @highlight-run/next
```

---

## Alternative: Axiom (log-based monitoring)

If you prefer log-based monitoring over SDK integration, [Axiom](https://axiom.co) can ingest pino JSON logs via a log drain:

1. Add `@axiomhq/pino` transport to `src/lib/logger.ts`
2. Set `AXIOM_TOKEN` and `AXIOM_DATASET`
3. Set up alerts in Axiom on `level >= 50` (error and above)

---

## What to monitor

Regardless of the tool chosen, configure alerts for:

| Condition | Suggested threshold |
|-----------|---------------------|
| API error rate | > 1% of requests |
| MCP tool execution failures | Any spike |
| FileMaker auth errors | > 5 in 5 minutes |
| p95 response time | > 3 seconds |
| Unhandled exceptions | Any new issue |

---

## pino log levels reference

| Level | Value | Meaning |
|-------|-------|---------|
| trace | 10 | Very verbose, dev only |
| debug | 20 | Dev diagnostics |
| info | 30 | Normal events |
| warn | 40 | Degraded but recoverable |
| error | 50 | Exceptions — alert on these |
| fatal | 60 | Process-level failure |

Set `LOG_LEVEL=warn` in production to reduce noise while preserving all actionable entries.

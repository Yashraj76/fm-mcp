/**
 * Polling utilities for playground session status.
 *
 * All functions are pure and side-effect-free so they can be tested directly.
 * The React hook that calls these lives in server-playground.tsx.
 */

/** First poll delay in milliseconds. */
export const MIN_INTERVAL_MS = 1_000

/** Maximum poll delay in milliseconds (exponential backoff capped here). */
export const MAX_INTERVAL_MS = 8_000

/**
 * How long to wait (ms) before giving up on a session that never reaches a
 * terminal state.  5 minutes covers even the slowest AI + FileMaker chains.
 */
export const POLL_TIMEOUT_MS = 5 * 60_000

/** Statuses that mean the session is finished — polling must stop. */
export const TERMINAL_STATUSES = new Set(['done', 'error', 'timeout'])

/** Returns true when the session has reached a terminal state. */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

/**
 * Returns the delay for the next poll given the number of polls already made.
 *
 * Schedule: 1 s → 2 s → 4 s → 8 s → 8 s → …
 *
 * This keeps the API quiet during long AI runs while still reacting quickly
 * when the session completes in under a second.
 */
export function nextIntervalMs(attemptsMade: number): number {
  return Math.min(MIN_INTERVAL_MS * Math.pow(2, attemptsMade), MAX_INTERVAL_MS)
}

/**
 * Returns true when the polling window has exceeded POLL_TIMEOUT_MS.
 *
 * @param startedAt  Value of Date.now() when polling began.
 * @param now        Current Date.now() value.
 */
export function isPollTimedOut(startedAt: number, now: number): boolean {
  return now - startedAt >= POLL_TIMEOUT_MS
}

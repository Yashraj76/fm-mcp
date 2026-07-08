/**
 * Maps a numeric progress value (0–100) to a human-readable phase label.
 * Accepts an optional job status to override phase when the job has already
 * reached a terminal state.
 */
export function progressToPhase(progress: number, status?: string | null): string {
  if (status === 'done') return 'Ready to review'
  if (status === 'failed') return 'Generation failed'
  if (progress >= 80) return 'Validating tools...'
  if (progress >= 70) return 'Parsing AI response...'
  if (progress >= 35) return 'Generating tools with AI...'
  if (progress >= 20) return 'Preparing schema payload...'
  if (progress >= 5) return 'Analyzing schema...'
  return 'Queued...'
}

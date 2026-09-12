import type { CardStatus, ProgressSummary } from '@qa/shared';

/**
 * Builds the summary behind every progress ring in the UI.
 *
 * A card the learner has flipped but not yet marked as known counts for half,
 * so the ring moves on the first pass through a deck instead of staying at zero
 * until the very end - the whole point of showing progress while flipping.
 */
export function summarize(statuses: CardStatus[], total: number): ProgressSummary {
  let known = 0;
  let learning = 0;

  for (const status of statuses) {
    if (status === 'KNOWN') known++;
    else if (status === 'LEARNING') learning++;
  }

  const seen = known + learning;
  const percent = total === 0 ? 0 : Math.round(((known + learning * 0.5) / total) * 100);

  return { total, seen, known, learning, percent };
}

/** Adds several summaries together, for section-level and global rollups. */
export function combine(summaries: ProgressSummary[]): ProgressSummary {
  const total = summaries.reduce((n, s) => n + s.total, 0);
  const known = summaries.reduce((n, s) => n + s.known, 0);
  const learning = summaries.reduce((n, s) => n + s.learning, 0);
  const seen = known + learning;
  const percent = total === 0 ? 0 : Math.round(((known + learning * 0.5) / total) * 100);

  return { total, seen, known, learning, percent };
}

/** Number of whole days between two instants, ignoring clock time. */
export function daysBetween(a: Date, b: Date): number {
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(Math.abs(dayB - dayA) / 86_400_000);
}

/**
 * Streak rules: studying again the next calendar day extends the streak,
 * studying twice in one day leaves it unchanged, and any longer gap resets it.
 */
export function nextStreak(current: number, lastActiveAt: Date | null, now: Date): number {
  if (!lastActiveAt) return 1;

  switch (daysBetween(lastActiveAt, now)) {
    case 0:
      // Already counted today - a second session does not double-count.
      return Math.max(current, 1);
    case 1:
      return current + 1;
    default:
      return 1;
  }
}

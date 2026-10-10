import type { CSSProperties } from 'react';

/** "1 deck" / "2 decks" — avoids the "1 decks" that plain interpolation gives. */
export function plural(count: number, noun: string, pluralForm?: string): string {
  const word = count === 1 ? noun : (pluralForm ?? `${noun}s`);
  return `${count} ${word}`;
}

/** Inline pill colours for a track, derived from its hex colour. */
export function trackPillStyle(color: string | null | undefined): CSSProperties {
  const c = color ?? '#2f8fa5';
  return { background: `${c}1f`, borderColor: `${c}66`, color: c };
}

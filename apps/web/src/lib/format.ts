/** "1 deck" / "2 decks" — avoids the "1 decks" that plain interpolation gives. */
export function plural(count: number, noun: string, pluralForm?: string): string {
  const word = count === 1 ? noun : (pluralForm ?? `${noun}s`);
  return `${count} ${word}`;
}

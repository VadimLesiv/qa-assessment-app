import type { Card } from '@prisma/client';
import type { Difficulty } from '@qa/shared';

export interface GeneratedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

/** Trims an answer to a length that reads well as a multiple-choice option. */
function condense(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Deterministic shuffle driven by a seed, so regenerating a quiz for the same
 * deck produces a stable ordering and tests stay reproducible.
 */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 - small, fast, and good enough for option ordering.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = Math.abs(state) % (i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Builds multiple-choice questions from a deck by using each card's back as the
 * correct answer and other cards' backs as distractors.
 *
 * This is the offline fallback. It needs at least 4 cards to produce a question
 * with three plausible distractors.
 */
export function generateFromCards(cards: Card[], limit = 10): GeneratedQuestion[] {
  const usable = cards.filter((c) => c.front.trim() && c.back.trim());
  if (usable.length < 4) return [];

  const questions: GeneratedQuestion[] = [];

  for (const [index, card] of usable.entries()) {
    if (questions.length >= limit) break;

    const distractors = seededShuffle(
      usable.filter((c) => c.id !== card.id),
      index + 1,
    )
      .slice(0, 3)
      .map((c) => condense(c.back));

    const correct = condense(card.back);
    // A distractor that condensed to the same text would make two options correct.
    if (distractors.includes(correct)) continue;

    const options = seededShuffle([correct, ...distractors], index + 7);
    const correctIndex = options.indexOf(correct);

    questions.push({
      prompt: `Which statement best describes "${condense(card.front, 100)}"?`,
      options,
      correctIndex,
      explanation: condense(card.back, 400),
      difficulty: pickDifficulty(index),
    });
  }

  return questions;
}

/** Spreads difficulty across the deck so a quiz ramps up rather than flatlining. */
function pickDifficulty(index: number): Difficulty {
  const cycle = index % 5;
  if (cycle < 2) return 'EASY';
  if (cycle < 4) return 'MEDIUM';
  return 'HARD';
}

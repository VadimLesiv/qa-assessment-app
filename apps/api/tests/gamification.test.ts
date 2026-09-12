import { describe, expect, it } from 'vitest';
import { levelForXp, starsForScore, xpForLevel } from '@qa/shared';
import { combine, daysBetween, nextStreak, summarize } from '../src/lib/progress.js';
import { generateFromCards } from '../src/services/quizgen.js';
import type { Card } from '@prisma/client';

describe('levelling', () => {
  it('starts at level 1 with no XP', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('levels up exactly at each threshold', () => {
    expect(xpForLevel(2)).toBe(100);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
  });

  it('makes each level cost more than the last', () => {
    const cost = (n: number) => xpForLevel(n + 1) - xpForLevel(n);
    expect(cost(2)).toBeGreaterThan(cost(1));
    expect(cost(3)).toBeGreaterThan(cost(2));
  });
});

describe('starsForScore', () => {
  it('awards 5 stars only at 95% or above', () => {
    expect(starsForScore(20, 20)).toBe(5);
    expect(starsForScore(19, 20)).toBe(5);
    expect(starsForScore(18, 20)).toBe(4);
  });

  it('gives no stars for a blank score and one for any correct answer', () => {
    expect(starsForScore(0, 10)).toBe(0);
    expect(starsForScore(1, 10)).toBe(1);
  });

  it('does not divide by zero on an empty quiz', () => {
    expect(starsForScore(0, 0)).toBe(0);
  });
});

describe('progress summary', () => {
  it('counts a learning card as half a known card', () => {
    const summary = summarize(['KNOWN', 'LEARNING', 'NEW', 'NEW'], 4);

    expect(summary.known).toBe(1);
    expect(summary.learning).toBe(1);
    expect(summary.seen).toBe(2);
    // (1 + 0.5) / 4 = 37.5% -> 38
    expect(summary.percent).toBe(38);
  });

  it('reports 100% only when every card is known', () => {
    expect(summarize(['KNOWN', 'KNOWN'], 2).percent).toBe(100);
    expect(summarize(['KNOWN', 'LEARNING'], 2).percent).toBe(75);
  });

  it('handles an empty deck without dividing by zero', () => {
    expect(summarize([], 0).percent).toBe(0);
  });

  it('combines sub-section summaries into a section total', () => {
    const combined = combine([summarize(['KNOWN', 'KNOWN'], 2), summarize(['NEW', 'NEW'], 2)]);

    expect(combined.total).toBe(4);
    expect(combined.known).toBe(2);
    expect(combined.percent).toBe(50);
  });
});

describe('streaks', () => {
  const day = (n: number) => new Date(2026, 0, n);

  it('starts at 1 for a brand new player', () => {
    expect(nextStreak(0, null, day(1))).toBe(1);
  });

  it('does not double-count two sessions on the same day', () => {
    expect(nextStreak(4, day(10), day(10))).toBe(4);
  });

  it('extends when the player returns the next day', () => {
    expect(nextStreak(4, day(10), day(11))).toBe(5);
  });

  it('resets after a missed day', () => {
    expect(nextStreak(9, day(10), day(12))).toBe(1);
  });

  it('measures whole calendar days, ignoring the time of day', () => {
    expect(daysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(1);
  });
});

describe('quiz generation', () => {
  const card = (id: string, front: string, back: string): Card =>
    ({
      id,
      subSectionId: 'deck',
      front,
      back,
      notes: null,
      bullets: '[]',
      sourceSlide: null,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as Card;

  const deck = [
    card('1', 'Equivalence partitioning', 'Group inputs handled identically and test one per group'),
    card('2', 'Boundary value analysis', 'Test at the edges of each partition'),
    card('3', 'Decision table', 'Enumerate combinations of conditions and their actions'),
    card('4', 'State transition', 'Model states and the events that move between them'),
    card('5', 'Pairwise testing', 'Cover every pair of parameter values at least once'),
  ];

  it('produces a question per card with four options', () => {
    const questions = generateFromCards(deck);

    expect(questions).toHaveLength(5);
    for (const question of questions) {
      expect(question.options).toHaveLength(4);
      expect(question.prompt).toContain('best describes');
    }
  });

  it('always marks a real option as the correct answer', () => {
    for (const question of generateFromCards(deck)) {
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(question.options.length);
      expect(question.options[question.correctIndex]).toBeTruthy();
    }
  });

  it('never repeats an option within a question', () => {
    for (const question of generateFromCards(deck)) {
      expect(new Set(question.options).size).toBe(question.options.length);
    }
  });

  it('refuses to generate from a deck too small for distractors', () => {
    expect(generateFromCards(deck.slice(0, 3))).toEqual([]);
  });

  it('is deterministic, so regenerating gives the same quiz', () => {
    expect(generateFromCards(deck)).toEqual(generateFromCards(deck));
  });

  it('respects the requested question limit', () => {
    expect(generateFromCards(deck, 2)).toHaveLength(2);
  });
});

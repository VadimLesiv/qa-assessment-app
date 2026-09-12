import type { Badge } from '@qa/shared';
import { prisma } from './prisma.js';

/** Catalogue of every badge the app can award. Codes are persisted, names are not. */
export const BADGE_CATALOGUE = [
  { code: 'FIRST_FLIP', name: 'First Flip', description: 'Flip your very first card', icon: '🃏' },
  { code: 'DECK_DONE', name: 'Deck Master', description: 'Mark every card in a deck as known', icon: '📚' },
  { code: 'FIRST_QUIZ', name: 'Quiz Rookie', description: 'Complete your first quiz', icon: '🎯' },
  { code: 'PERFECT_QUIZ', name: 'Flawless', description: 'Score 100% on a quiz', icon: '💎' },
  { code: 'FIVE_STAR', name: 'Five Star', description: 'Earn a 5-star rating', icon: '⭐' },
  { code: 'STREAK_3', name: 'On a Roll', description: 'Study 3 days in a row', icon: '🔥' },
  { code: 'STREAK_7', name: 'Unstoppable', description: 'Study 7 days in a row', icon: '⚡' },
  { code: 'LEVEL_5', name: 'Rising Star', description: 'Reach level 5', icon: '🚀' },
  { code: 'LEVEL_10', name: 'QA Veteran', description: 'Reach level 10', icon: '🏆' },
  { code: 'IMPORTER', name: 'Deck Builder', description: 'Import a PowerPoint deck', icon: '📥' },
] as const;

export type BadgeCode = (typeof BADGE_CATALOGUE)[number]['code'];

const BY_CODE = new Map(BADGE_CATALOGUE.map((b) => [b.code, b]));

/**
 * Awards badges the player has not already earned.
 * Returns only the newly created ones, so the UI can celebrate exactly once.
 */
export async function award(playerId: string, codes: BadgeCode[]): Promise<Badge[]> {
  if (codes.length === 0) return [];

  const unique = [...new Set(codes)];
  const existing = await prisma.earnedBadge.findMany({
    where: { playerId, code: { in: unique } },
    select: { code: true },
  });
  const already = new Set(existing.map((e) => e.code));
  const toAward = unique.filter((c) => !already.has(c));
  if (toAward.length === 0) return [];

  // createMany cannot return rows on SQLite, so create individually.
  const created = await Promise.all(
    toAward.map((code) => prisma.earnedBadge.create({ data: { playerId, code } })),
  );

  return created.flatMap((row) => {
    const meta = BY_CODE.get(row.code as BadgeCode);
    return meta ? [{ id: row.id, ...meta, earnedAt: row.earnedAt.toISOString() }] : [];
  });
}

/** The full catalogue, with `earnedAt` filled in for the ones this player has. */
export async function listForPlayer(playerId: string): Promise<Badge[]> {
  const earned = await prisma.earnedBadge.findMany({ where: { playerId } });
  const byCode = new Map(earned.map((e) => [e.code, e]));

  return BADGE_CATALOGUE.map((meta) => {
    const row = byCode.get(meta.code);
    return {
      id: row?.id ?? meta.code,
      code: meta.code,
      name: meta.name,
      description: meta.description,
      icon: meta.icon,
      earnedAt: row ? row.earnedAt.toISOString() : null,
    };
  });
}

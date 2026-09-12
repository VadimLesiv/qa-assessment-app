import type { CardStatus } from '@qa/shared';
import { prisma } from './prisma.js';

/**
 * Loads this player's status for the given cards in one query.
 * Cards with no row yet are implicitly NEW, so callers can default on lookup.
 */
export async function statusMap(playerId: string, cardIds: string[]): Promise<Map<string, CardStatus>> {
  if (cardIds.length === 0) return new Map();

  const rows = await prisma.cardProgress.findMany({
    where: { playerId, cardId: { in: cardIds } },
    select: { cardId: true, status: true },
  });

  return new Map(rows.map((r) => [r.cardId, r.status as CardStatus]));
}

/** Statuses for every card in a sub-section, padded with NEW for untouched cards. */
export function statusesFor(cardIds: string[], map: Map<string, CardStatus>): CardStatus[] {
  return cardIds.map((id) => map.get(id) ?? 'NEW');
}

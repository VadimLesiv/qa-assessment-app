import { Router } from 'express';
import { z } from 'zod';
import { XP_PER_CARD_FLIPPED, XP_PER_CARD_KNOWN } from '@qa/shared';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { serializeCard } from '../lib/serialize.js';
import { summarize } from '../lib/progress.js';
import { statusMap, statusesFor } from '../lib/progressQuery.js';
import { getProfile, grantXp, resolvePlayerId } from '../lib/player.js';
import { award, type BadgeCode } from '../lib/badges.js';

export const cardsRouter = Router();

const updateSchema = z
  .object({
    front: z.string().trim().min(1).max(500).optional(),
    back: z.string().trim().min(1).max(5000).optional(),
    notes: z.string().trim().max(5000).nullish(),
    bullets: z.array(z.string().trim().max(500)).max(20).optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const progressSchema = z.object({
  status: z.enum(['NEW', 'LEARNING', 'KNOWN']),
  /** Set when the update was triggered by the learner flipping the card. */
  flipped: z.boolean().optional(),
});

async function loadCardOrThrow(id: string) {
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) throw HttpError.notFound('Card');
  return card;
}

/** GET /api/cards/:id */
cardsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const card = await loadCardOrThrow(req.params.id!);
    const map = await statusMap(playerId, [card.id]);
    res.json({ data: serializeCard(card, map.get(card.id) ?? 'NEW') });
  }),
);

/** PUT /api/cards/:id - edit a flashcard's content or position. */
cardsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await loadCardOrThrow(req.params.id!);

    const card = await prisma.card.update({
      where: { id: existing.id },
      data: {
        ...(input.front !== undefined ? { front: input.front } : {}),
        ...(input.back !== undefined ? { back: input.back } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.bullets !== undefined ? { bullets: JSON.stringify(input.bullets) } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
      },
    });

    res.json({ data: serializeCard(card) });
  }),
);

/** DELETE /api/cards/:id */
cardsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await loadCardOrThrow(req.params.id!);
    await prisma.card.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

/**
 * PUT /api/cards/:id/progress
 *
 * Idempotent by design: re-sending the same status does not re-award XP, so a
 * flaky network or a double-click cannot inflate the score.
 */
cardsRouter.put(
  '/:id/progress',
  asyncHandler(async (req, res) => {
    const input = progressSchema.parse(req.body);
    const playerId = await resolvePlayerId(req);
    const card = await loadCardOrThrow(req.params.id!);

    const before = await prisma.cardProgress.findUnique({
      where: { playerId_cardId: { playerId, cardId: card.id } },
    });

    const isFirstFlip = !before && input.flipped;
    const newlyKnown = input.status === 'KNOWN' && before?.status !== 'KNOWN';

    const progress = await prisma.cardProgress.upsert({
      where: { playerId_cardId: { playerId, cardId: card.id } },
      create: {
        playerId,
        cardId: card.id,
        status: input.status,
        flips: input.flipped ? 1 : 0,
      },
      update: {
        status: input.status,
        ...(input.flipped ? { flips: { increment: 1 } } : {}),
        lastSeenAt: new Date(),
      },
    });

    let xpEarned = 0;
    if (isFirstFlip) xpEarned += XP_PER_CARD_FLIPPED;
    if (newlyKnown) xpEarned += XP_PER_CARD_KNOWN;
    if (xpEarned > 0) await grantXp(playerId, xpEarned);

    // Recompute the deck so the client can update its ring without a refetch.
    const siblings = await prisma.card.findMany({
      where: { subSectionId: card.subSectionId },
      select: { id: true },
    });
    const ids = siblings.map((c) => c.id);
    const map = await statusMap(playerId, ids);
    const deckProgress = summarize(statusesFor(ids, map), ids.length);

    const codes: BadgeCode[] = [];
    if (input.flipped) codes.push('FIRST_FLIP');
    if (deckProgress.total > 0 && deckProgress.known === deckProgress.total) codes.push('DECK_DONE');

    const profile = await getProfile(playerId);
    if (profile.level >= 5) codes.push('LEVEL_5');
    if (profile.level >= 10) codes.push('LEVEL_10');
    if (profile.streakDays >= 3) codes.push('STREAK_3');
    if (profile.streakDays >= 7) codes.push('STREAK_7');

    const newBadges = await award(playerId, codes);

    res.json({
      data: {
        cardId: card.id,
        status: progress.status,
        flips: progress.flips,
        xpEarned,
        deckProgress,
        // Re-read only when badges changed the profile; otherwise reuse.
        profile: newBadges.length > 0 ? await getProfile(playerId) : profile,
        newBadges,
      },
    });
  }),
);

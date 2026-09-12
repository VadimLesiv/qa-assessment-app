import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/errors.js';
import { getProfile, resolvePlayerId } from '../lib/player.js';
import { combine, summarize } from '../lib/progress.js';
import { statusMap, statusesFor } from '../lib/progressQuery.js';

export const profileRouter = Router();

const renameSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** GET /api/profile - XP, level, streak and the badge shelf. */
profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    res.json({ data: await getProfile(playerId) });
  }),
);

/** PUT /api/profile - rename the player. */
profileRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const input = renameSchema.parse(req.body);
    const playerId = await resolvePlayerId(req);
    await prisma.player.update({ where: { id: playerId }, data: { name: input.name } });
    res.json({ data: await getProfile(playerId) });
  }),
);

/**
 * GET /api/progress
 * Overall and per-track rollups for the dashboard header.
 */
profileRouter.get(
  '/progress',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);

    const sections = await prisma.section.findMany({
      include: { subSections: { include: { cards: { select: { id: true } } } } },
    });

    const map = await statusMap(
      playerId,
      sections.flatMap((s) => s.subSections.flatMap((sub) => sub.cards.map((c) => c.id))),
    );

    const perSection = sections.map((section) => {
      const ids = section.subSections.flatMap((sub) => sub.cards.map((c) => c.id));
      return { track: section.track, summary: summarize(statusesFor(ids, map), ids.length) };
    });

    const byTrack = (track: string) =>
      combine(perSection.filter((p) => p.track === track).map((p) => p.summary));

    res.json({
      data: {
        overall: combine(perSection.map((p) => p.summary)),
        process: byTrack('PROCESS'),
        technical: byTrack('TECHNICAL'),
      },
    });
  }),
);

/** GET /api/profile/attempts - recent quiz history across all decks. */
profileRouter.get(
  '/attempts',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const attempts = await prisma.quizAttempt.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { subSection: { select: { name: true, section: { select: { name: true } } } } },
    });

    res.json({
      data: attempts.map((a) => ({
        id: a.id,
        subSectionId: a.subSectionId,
        subSectionName: a.subSection.name,
        sectionName: a.subSection.section.name,
        score: a.score,
        total: a.total,
        xpEarned: a.xpEarned,
        stars: a.stars,
        durationMs: a.durationMs,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  }),
);

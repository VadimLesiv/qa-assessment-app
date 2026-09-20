import { Router } from 'express';
import { levelForXp } from '@qa/shared';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/errors.js';
import { resolvePlayerId } from '../lib/player.js';

export const leaderboardRouter = Router();

/** GET /api/leaderboard - every registered player, ranked by XP. */
leaderboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const currentPlayerId = await resolvePlayerId(req);

    const players = await prisma.player.findMany({
      where: { email: { not: null } },
      orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        xp: true,
        streakDays: true,
        _count: { select: { attempts: true, badges: true } },
      },
    });

    const entries = players.map((player, index) => ({
      rank: index + 1,
      playerId: player.id,
      name: player.name,
      xp: player.xp,
      level: levelForXp(player.xp),
      streakDays: player.streakDays,
      quizAttempts: player._count.attempts,
      badgeCount: player._count.badges,
      isYou: player.id === currentPlayerId,
    }));

    res.json({ data: entries });
  }),
);

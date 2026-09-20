import type { Request } from 'express';
import { levelForXp, xpForLevel, type PlayerProfile } from '@qa/shared';
import { prisma } from './prisma.js';
import { listForPlayer } from './badges.js';
import { nextStreak } from './progress.js';
import { requireAuth } from './auth.js';

/** Every row is already keyed by player id, so the logged-in player owns their own data. */
export async function resolvePlayerId(req: Request): Promise<string> {
  return requireAuth(req);
}

/** Adds XP and refreshes the daily streak in one write. */
export async function grantXp(playerId: string, amount: number): Promise<void> {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { xp: true, streakDays: true, lastActiveAt: true },
  });

  const now = new Date();
  await prisma.player.update({
    where: { id: playerId },
    data: {
      xp: player.xp + Math.max(0, amount),
      streakDays: nextStreak(player.streakDays, player.lastActiveAt, now),
      lastActiveAt: now,
    },
  });
}

export async function getProfile(playerId: string): Promise<PlayerProfile> {
  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  const level = levelForXp(player.xp);

  return {
    id: player.id,
    name: player.name,
    xp: player.xp,
    level,
    levelStartXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    streakDays: player.streakDays,
    lastActiveAt: player.lastActiveAt ? player.lastActiveAt.toISOString() : null,
    badges: await listForPlayer(player.id),
  };
}

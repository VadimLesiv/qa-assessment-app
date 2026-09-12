import type { Request } from 'express';
import { levelForXp, xpForLevel, type PlayerProfile } from '@qa/shared';
import { prisma } from './prisma.js';
import { listForPlayer } from './badges.js';
import { nextStreak } from './progress.js';

/**
 * The app is single-player for now, but every row is already keyed by player so
 * adding real accounts later is a routing change rather than a migration.
 *
 * A client may pin itself to a specific player via `x-player-id`; otherwise the
 * default local player is used and created on first use.
 */
const DEFAULT_PLAYER_NAME = 'QA Trainee';

export async function resolvePlayerId(req: Request): Promise<string> {
  const header = req.header('x-player-id');
  if (header) {
    const found = await prisma.player.findUnique({ where: { id: header }, select: { id: true } });
    if (found) return found.id;
  }

  const first = await prisma.player.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (first) return first.id;

  const created = await prisma.player.create({ data: { name: DEFAULT_PLAYER_NAME } });
  return created.id;
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

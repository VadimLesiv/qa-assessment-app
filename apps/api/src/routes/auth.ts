import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../lib/auth.js';
import { getProfile } from '../lib/player.js';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(60),
});

/** POST /api/auth/register - create a profile and sign the player in. */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.player.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, 'CONFLICT', 'An account with that email already exists');

    const passwordHash = await hashPassword(input.password);

    // A single pre-existing local player (created before accounts existed) has
    // real study progress attached. Let the very first registration claim it
    // instead of stranding that XP under an account nobody can sign into.
    const legacy = await prisma.player.findFirst({
      where: { email: null },
      orderBy: { createdAt: 'asc' },
    });

    const player = legacy
      ? await prisma.player.update({
          where: { id: legacy.id },
          data: { name: input.name, email: input.email, passwordHash },
        })
      : await prisma.player.create({
          data: { name: input.name, email: input.email, passwordHash },
        });

    res.status(201).json({ data: { token: signToken(player.id), profile: await getProfile(player.id) } });
  }),
);

/** POST /api/auth/login - verify credentials and issue a token. */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = credentialsSchema.parse(req.body);

    const player = await prisma.player.findUnique({ where: { email: input.email } });
    if (!player?.passwordHash || !(await verifyPassword(input.password, player.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    }

    res.json({ data: { token: signToken(player.id), profile: await getProfile(player.id) } });
  }),
);

/** GET /api/auth/me - resolve the current token back to a profile, for session restore. */
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const playerId = requireAuth(req);
    res.json({ data: await getProfile(playerId) });
  }),
);

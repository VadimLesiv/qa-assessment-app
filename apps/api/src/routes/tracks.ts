import { Router } from 'express';
import { z } from 'zod';
import type { Track as TrackDto } from '@qa/shared';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { ensureDefaultTracks, uniqueTrackKey } from '../lib/tracks.js';

export const tracksRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  blurb: z.string().trim().max(300).nullish(),
  icon: z.string().trim().max(8).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #7c3aed')
    .nullish(),
});

const updateSchema = createSchema.partial();

type TrackRow = Awaited<ReturnType<typeof prisma.track.findMany>>[number];

const toDto = (t: TrackRow): TrackDto => ({
  id: t.id,
  key: t.key,
  name: t.name,
  blurb: t.blurb,
  icon: t.icon,
  color: t.color,
  order: t.order,
});

/** GET /api/tracks */
tracksRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await ensureDefaultTracks();
    const tracks = await prisma.track.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    res.json({ data: tracks.map(toDto) });
  }),
);

/** POST /api/tracks - add a track after the existing ones. */
tracksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    await ensureDefaultTracks();

    const clash = await prisma.track.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw HttpError.conflict('A track with that name already exists');

    const last = await prisma.track.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
    const track = await prisma.track.create({
      data: {
        key: await uniqueTrackKey(input.name),
        name: input.name,
        blurb: input.blurb ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        order: (last?.order ?? -1) + 1,
      },
    });

    res.status(201).json({ data: toDto(track) });
  }),
);

/** PUT /api/tracks/:id - edit display details; the key never changes. */
tracksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.track.findUnique({ where: { id: req.params.id } });
    if (!existing) throw HttpError.notFound('Track');

    const track = await prisma.track.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.blurb !== undefined ? { blurb: input.blurb ?? null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      },
    });
    res.json({ data: toDto(track) });
  }),
);

/** DELETE /api/tracks/:id - only when no section still belongs to it. */
tracksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.track.findUnique({ where: { id: req.params.id } });
    if (!existing) throw HttpError.notFound('Track');

    const inUse = await prisma.section.count({ where: { track: existing.key } });
    if (inUse > 0) throw HttpError.conflict('Move or delete the sections in this track first');

    await prisma.track.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { serializeSection, serializeSubSection, slugify } from '../lib/serialize.js';
import { combine, summarize } from '../lib/progress.js';
import { statusMap, statusesFor } from '../lib/progressQuery.js';
import { resolvePlayerId } from '../lib/player.js';

export const sectionsRouter = Router();

const trackSchema = z.enum(['PROCESS', 'TECHNICAL']);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  track: trackSchema,
  description: z.string().trim().max(2000).nullish(),
  icon: z.string().trim().max(8).nullish(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Accent must be a hex colour like #7c3aed')
    .nullish(),
});

const updateSchema = createSchema.partial().extend({ order: z.number().int().min(0).optional() });

const reorderSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, 'Send at least one section id')
    .refine((ids) => new Set(ids).size === ids.length, 'Section ids must be unique'),
});

/** Slugs are unique; append -2, -3 ... until a free one is found. */
async function uniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await prisma.section.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash || clash.id === ignoreId) return candidate;
  }
}

/**
 * GET /api/sections
 * Full tree with per-sub-section and per-section progress, which is everything
 * the dashboard needs in a single round trip.
 */
sectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const track = req.query.track;
    const where = typeof track === 'string' ? { track: trackSchema.parse(track) } : {};

    const sections = await prisma.section.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        subSections: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            cards: { orderBy: { order: 'asc' }, select: { id: true } },
            _count: { select: { questions: true } },
          },
        },
      },
    });

    const allCardIds = sections.flatMap((s) => s.subSections.flatMap((sub) => sub.cards.map((c) => c.id)));
    const map = await statusMap(playerId, allCardIds);

    const payload = sections.map((section) => {
      const subs = section.subSections.map((sub) => {
        const ids = sub.cards.map((c) => c.id);
        return serializeSubSection(sub, {
          cardCount: ids.length,
          quizQuestionCount: sub._count.questions,
          progress: summarize(statusesFor(ids, map), ids.length),
        });
      });

      return serializeSection(section, {
        subSections: subs,
        progress: combine(subs.map((s) => s.progress!)),
      });
    });

    res.json({ data: payload });
  }),
);

/** GET /api/sections/:id - one section with its sub-sections. */
sectionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const section = await prisma.section.findUnique({
      where: { id: req.params.id },
      include: {
        subSections: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            cards: { orderBy: { order: 'asc' }, select: { id: true } },
            _count: { select: { questions: true } },
          },
        },
      },
    });

    if (!section) throw HttpError.notFound('Section');

    const ids = section.subSections.flatMap((s) => s.cards.map((c) => c.id));
    const map = await statusMap(playerId, ids);

    const subs = section.subSections.map((sub) => {
      const subIds = sub.cards.map((c) => c.id);
      return serializeSubSection(sub, {
        cardCount: subIds.length,
        quizQuestionCount: sub._count.questions,
        progress: summarize(statusesFor(subIds, map), subIds.length),
      });
    });

    res.json({
      data: serializeSection(section, { subSections: subs, progress: combine(subs.map((s) => s.progress!)) }),
    });
  }),
);

/** POST /api/sections */
sectionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const last = await prisma.section.findFirst({
      where: { track: input.track },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const section = await prisma.section.create({
      data: {
        name: input.name,
        slug: await uniqueSlug(input.name),
        track: input.track,
        description: input.description ?? null,
        icon: input.icon ?? null,
        accent: input.accent ?? null,
        order: (last?.order ?? -1) + 1,
      },
    });

    res.status(201).json({ data: serializeSection(section, { subSections: [] }) });
  }),
);

/**
 * PUT /api/sections/reorder
 * Persists a drag-and-drop reshuffle: every section listed gets its `order` set
 * to its position in `ids`. Declared before `/:id` so "reorder" is not read as
 * a section id.
 */
sectionsRouter.put(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);

    const found = await prisma.section.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) throw HttpError.badRequest('One or more sections no longer exist');

    // One transaction so a failed write can never leave a half-applied order.
    await prisma.$transaction(
      ids.map((id, index) => prisma.section.update({ where: { id }, data: { order: index } })),
    );

    res.status(204).end();
  }),
);

/** PUT /api/sections/:id - rename, re-theme, re-order or move between tracks. */
sectionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!existing) throw HttpError.notFound('Section');

    const section = await prisma.section.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name, slug: await uniqueSlug(input.name, existing.id) } : {}),
        ...(input.track !== undefined ? { track: input.track } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
        ...(input.accent !== undefined ? { accent: input.accent ?? null } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
      },
    });

    res.json({ data: serializeSection(section) });
  }),
);

/**
 * DELETE /api/sections/:id
 * Cascades to sub-sections, cards, questions and progress rows via the schema.
 */
sectionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.section.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) throw HttpError.notFound('Section');

    await prisma.section.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

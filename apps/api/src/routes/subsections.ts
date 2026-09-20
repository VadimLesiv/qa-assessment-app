import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { serializeCard, serializeSubSection } from '../lib/serialize.js';
import { summarize } from '../lib/progress.js';
import { statusMap, statusesFor } from '../lib/progressQuery.js';
import { resolvePlayerId } from '../lib/player.js';
import { award } from '../lib/badges.js';
import { parsePptx } from '../services/pptx.js';

export const subSectionsRouter = Router();
/** Mounted at /api/sections so sub-sections can be listed and created in place. */
export const nestedSubSectionsRouter = Router({ mergeParams: true });

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).nullish(),
});

const updateSchema = createSchema.partial().extend({
  order: z.number().int().min(0).optional(),
  sectionId: z.string().min(1).optional(),
});

/**
 * A drag-and-drop reshuffle is described as the full, final deck list of every
 * section the drag touched - one group for a move inside a section, two for a
 * move across sections.
 */
const reorderSchema = z.object({
  groups: z
    .array(
      z.object({
        sectionId: z.string().min(1),
        subSectionIds: z.array(z.string().min(1)),
      }),
    )
    .min(1, 'Send at least one section'),
});

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isPptx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      file.originalname.toLowerCase().endsWith('.pptx');

    // Rejecting with an HttpError keeps the 415 body consistent with other routes.
    if (!isPptx) {
      cb(HttpError.unsupportedMedia('Only .pptx presentations can be imported'));
      return;
    }
    cb(null, true);
  },
});

async function loadSubSectionOrThrow(id: string) {
  const sub = await prisma.subSection.findUnique({ where: { id } });
  if (!sub) throw HttpError.notFound('Sub-section');
  return sub;
}

/* ------------------------------------------------------------------ */
/* Nested under a section                                              */
/* ------------------------------------------------------------------ */

/** GET /api/sections/:sectionId/subsections */
nestedSubSectionsRouter.get(
  '/:sectionId/subsections',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const subs = await prisma.subSection.findMany({
      where: { sectionId: req.params.sectionId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        cards: { orderBy: { order: 'asc' }, select: { id: true } },
        _count: { select: { questions: true } },
      },
    });

    const map = await statusMap(playerId, subs.flatMap((s) => s.cards.map((c) => c.id)));

    res.json({
      data: subs.map((sub) => {
        const ids = sub.cards.map((c) => c.id);
        return serializeSubSection(sub, {
          cardCount: ids.length,
          quizQuestionCount: sub._count.questions,
          progress: summarize(statusesFor(ids, map), ids.length),
        });
      }),
    });
  }),
);

/** POST /api/sections/:sectionId/subsections */
nestedSubSectionsRouter.post(
  '/:sectionId/subsections',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const sectionId = req.params.sectionId!;

    const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { id: true } });
    if (!section) throw HttpError.notFound('Section');

    const last = await prisma.subSection.findFirst({
      where: { sectionId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const sub = await prisma.subSection.create({
      data: {
        sectionId,
        name: input.name,
        description: input.description ?? null,
        order: (last?.order ?? -1) + 1,
      },
    });

    res.status(201).json({
      data: serializeSubSection(sub, { cards: [], cardCount: 0, quizQuestionCount: 0 }),
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Direct sub-section access                                           */
/* ------------------------------------------------------------------ */

/** GET /api/subsections/:id - the deck, with each card's status for this player. */
subSectionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const sub = await prisma.subSection.findUnique({
      where: { id: req.params.id },
      include: {
        cards: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { questions: true } },
      },
    });

    if (!sub) throw HttpError.notFound('Sub-section');

    const ids = sub.cards.map((c) => c.id);
    const map = await statusMap(playerId, ids);

    res.json({
      data: {
        ...serializeSubSection(sub, {
          cardCount: ids.length,
          quizQuestionCount: sub._count.questions,
          progress: summarize(statusesFor(ids, map), ids.length),
        }),
        cards: sub.cards.map((c) => serializeCard(c, map.get(c.id) ?? 'NEW')),
      },
    });
  }),
);

/**
 * PUT /api/subsections/reorder
 * Re-seats every listed deck into the given section at the given position, so a
 * single call covers both reordering and moving between sections. Declared
 * before `/:id` so "reorder" is not read as a deck id.
 */
subSectionsRouter.put(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { groups } = reorderSchema.parse(req.body);

    const sectionIds = groups.map((g) => g.sectionId);
    if (new Set(sectionIds).size !== sectionIds.length) {
      throw HttpError.badRequest('Each section may only appear once');
    }

    const deckIds = groups.flatMap((g) => g.subSectionIds);
    if (new Set(deckIds).size !== deckIds.length) {
      throw HttpError.badRequest('Each deck may only appear once');
    }

    const sections = await prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true } });
    if (sections.length !== sectionIds.length) throw HttpError.badRequest('One or more sections no longer exist');

    const decks = await prisma.subSection.findMany({ where: { id: { in: deckIds } }, select: { id: true } });
    if (decks.length !== deckIds.length) throw HttpError.badRequest('One or more decks no longer exist');

    await prisma.$transaction(
      groups.flatMap((group) =>
        group.subSectionIds.map((id, index) =>
          prisma.subSection.update({
            where: { id },
            data: { sectionId: group.sectionId, order: index },
          }),
        ),
      ),
    );

    res.status(204).end();
  }),
);

/** PUT /api/subsections/:id - rename, reorder, or move to another section. */
subSectionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await loadSubSectionOrThrow(req.params.id!);

    if (input.sectionId && input.sectionId !== existing.sectionId) {
      const target = await prisma.section.findUnique({ where: { id: input.sectionId }, select: { id: true } });
      if (!target) throw HttpError.badRequest('Target section does not exist');
    }

    const sub = await prisma.subSection.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
      },
    });

    res.json({ data: serializeSubSection(sub) });
  }),
);

/** DELETE /api/subsections/:id */
subSectionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await loadSubSectionOrThrow(req.params.id!);
    await prisma.subSection.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

/* ------------------------------------------------------------------ */
/* Cards within a sub-section                                          */
/* ------------------------------------------------------------------ */

const createCardSchema = z.object({
  front: z.string().trim().min(1, 'Front text is required').max(500),
  back: z.string().trim().min(1, 'Back text is required').max(5000),
  notes: z.string().trim().max(5000).nullish(),
  bullets: z.array(z.string().trim().max(500)).max(20).optional(),
});

/** GET /api/subsections/:id/cards */
subSectionsRouter.get(
  '/:id/cards',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    await loadSubSectionOrThrow(req.params.id!);

    const cards = await prisma.card.findMany({
      where: { subSectionId: req.params.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    const map = await statusMap(playerId, cards.map((c) => c.id));
    res.json({ data: cards.map((c) => serializeCard(c, map.get(c.id) ?? 'NEW')) });
  }),
);

/** POST /api/subsections/:id/cards - manual flashcard authoring. */
subSectionsRouter.post(
  '/:id/cards',
  asyncHandler(async (req, res) => {
    const input = createCardSchema.parse(req.body);
    const sub = await loadSubSectionOrThrow(req.params.id!);

    const last = await prisma.card.findFirst({
      where: { subSectionId: sub.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const card = await prisma.card.create({
      data: {
        subSectionId: sub.id,
        front: input.front,
        back: input.back,
        notes: input.notes ?? null,
        bullets: JSON.stringify(input.bullets ?? []),
        order: (last?.order ?? -1) + 1,
      },
    });

    res.status(201).json({ data: serializeCard(card, 'NEW') });
  }),
);

/* ------------------------------------------------------------------ */
/* PowerPoint import                                                   */
/* ------------------------------------------------------------------ */

/**
 * POST /api/subsections/:id/import
 * Accepts a multipart `file` field. `?preview=true` parses and returns the draft
 * cards without saving, so the user can confirm before the deck is written.
 */
subSectionsRouter.post(
  '/:id/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    const sub = await loadSubSectionOrThrow(req.params.id!);

    if (!req.file) throw HttpError.badRequest('Attach a .pptx file in the "file" field');

    const preview = await parsePptx(req.file.buffer, req.file.originalname);

    if (req.query.preview === 'true') {
      res.json({ data: preview });
      return;
    }

    const last = await prisma.card.findFirst({
      where: { subSectionId: sub.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let order = (last?.order ?? -1) + 1;

    // One transaction so a partial deck is never left behind on failure.
    const created = await prisma.$transaction(
      preview.cards.map((card) =>
        prisma.card.create({
          data: {
            subSectionId: sub.id,
            front: card.front,
            back: card.back,
            notes: card.notes,
            bullets: JSON.stringify(card.bullets),
            sourceSlide: card.sourceSlide,
            order: order++,
          },
        }),
      ),
    );

    const newBadges = await award(playerId, ['IMPORTER']);

    res.status(201).json({
      data: {
        imported: created.length,
        slideCount: preview.slideCount,
        cards: created.map((c) => serializeCard(c, 'NEW')),
        newBadges,
      },
    });
  }),
);

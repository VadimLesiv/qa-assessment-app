import { Router } from 'express';
import { z } from 'zod';
import {
  XP_PERFECT_QUIZ_BONUS,
  XP_PER_CORRECT_ANSWER,
  starsForScore,
  type Difficulty,
  type QuizResult,
} from '@qa/shared';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/errors.js';
import { serializeQuestion } from '../lib/serialize.js';
import { getProfile, grantXp, resolvePlayerId } from '../lib/player.js';
import { award, type BadgeCode } from '../lib/badges.js';
import { generateFromCards } from '../services/quizgen.js';

/** Quiz endpoints nested under a sub-section. Mounted at /api/subsections. */
export const quizRouter = Router();
/** Authoring endpoints for individual questions. Mounted at /api/questions. */
export const questionsRouter = Router();

const questionSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required').max(500),
  options: z.array(z.string().trim().min(1).max(300)).min(2, 'At least two options').max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(2000).nullish(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
});

/** correctIndex must point at a real option, which Zod cannot check field-by-field. */
const createQuestionSchema = questionSchema.refine((v) => v.correctIndex < v.options.length, {
  message: 'correctIndex must point at one of the supplied options',
  path: ['correctIndex'],
});

const submitSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().min(1), selectedIndex: z.number().int().min(0) }))
    .min(1, 'Answer at least one question'),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
});

async function loadSubSectionOrThrow(id: string) {
  const sub = await prisma.subSection.findUnique({ where: { id } });
  if (!sub) throw HttpError.notFound('Sub-section');
  return sub;
}

/**
 * GET /api/subsections/:id/quiz
 * Answers are stripped from the payload - grading happens server side only.
 */
quizRouter.get(
  '/:id/quiz',
  asyncHandler(async (req, res) => {
    await loadSubSectionOrThrow(req.params.id!);

    const questions = await prisma.quizQuestion.findMany({
      where: { subSectionId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: questions.map((q) => serializeQuestion(q, false)) });
  }),
);

/**
 * POST /api/subsections/:id/quiz/generate
 * Builds questions from the deck's cards. Existing questions are left alone
 * unless `?replace=true` is passed.
 */
quizRouter.post(
  '/:id/quiz/generate',
  asyncHandler(async (req, res) => {
    const sub = await loadSubSectionOrThrow(req.params.id!);

    const cards = await prisma.card.findMany({
      where: { subSectionId: sub.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    const generated = generateFromCards(cards);
    if (generated.length === 0) {
      throw HttpError.badRequest('This deck needs at least 4 cards before a quiz can be generated');
    }

    if (req.query.replace === 'true') {
      await prisma.quizQuestion.deleteMany({ where: { subSectionId: sub.id } });
    }

    const created = await prisma.$transaction(
      generated.map((q) =>
        prisma.quizQuestion.create({
          data: {
            subSectionId: sub.id,
            prompt: q.prompt,
            options: JSON.stringify(q.options),
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            difficulty: q.difficulty,
          },
        }),
      ),
    );

    res.status(201).json({ data: created.map((q) => serializeQuestion(q, false)) });
  }),
);

/** POST /api/subsections/:id/quiz/questions - hand-written question. */
quizRouter.post(
  '/:id/quiz/questions',
  asyncHandler(async (req, res) => {
    const input = createQuestionSchema.parse(req.body);
    const sub = await loadSubSectionOrThrow(req.params.id!);

    const question = await prisma.quizQuestion.create({
      data: {
        subSectionId: sub.id,
        prompt: input.prompt,
        options: JSON.stringify(input.options),
        correctIndex: input.correctIndex,
        explanation: input.explanation ?? null,
        difficulty: input.difficulty,
      },
    });

    res.status(201).json({ data: serializeQuestion(question, true) });
  }),
);

/**
 * POST /api/subsections/:id/quiz/attempts
 * Grades the submission, awards XP and returns a per-question breakdown.
 */
quizRouter.post(
  '/:id/quiz/attempts',
  asyncHandler(async (req, res) => {
    const input = submitSchema.parse(req.body);
    const playerId = await resolvePlayerId(req);
    const sub = await loadSubSectionOrThrow(req.params.id!);

    const questions = await prisma.quizQuestion.findMany({
      where: { subSectionId: sub.id, id: { in: input.answers.map((a) => a.questionId) } },
    });

    if (questions.length !== input.answers.length) {
      throw HttpError.badRequest('One or more answers refer to a question outside this quiz');
    }

    const byId = new Map(questions.map((q) => [q.id, q]));
    let score = 0;
    let xpEarned = 0;

    const breakdown: QuizResult['answers'] = input.answers.map((answer) => {
      const question = byId.get(answer.questionId)!;
      const correct = question.correctIndex === answer.selectedIndex;

      if (correct) {
        score++;
        xpEarned += XP_PER_CORRECT_ANSWER[question.difficulty as Difficulty] ?? XP_PER_CORRECT_ANSWER.MEDIUM;
      }

      return {
        questionId: question.id,
        prompt: question.prompt,
        selectedIndex: answer.selectedIndex,
        correctIndex: question.correctIndex,
        correct,
        explanation: question.explanation,
      };
    });

    const total = input.answers.length;
    const perfect = score === total;
    if (perfect) xpEarned += XP_PERFECT_QUIZ_BONUS;

    const stars = starsForScore(score, total);

    const attempt = await prisma.quizAttempt.create({
      data: { playerId, subSectionId: sub.id, score, total, xpEarned, stars, durationMs: input.durationMs },
    });

    await grantXp(playerId, xpEarned);

    const profile = await getProfile(playerId);
    const codes: BadgeCode[] = ['FIRST_QUIZ'];
    if (perfect) codes.push('PERFECT_QUIZ');
    if (stars === 5) codes.push('FIVE_STAR');
    if (profile.level >= 5) codes.push('LEVEL_5');
    if (profile.level >= 10) codes.push('LEVEL_10');
    if (profile.streakDays >= 3) codes.push('STREAK_3');
    if (profile.streakDays >= 7) codes.push('STREAK_7');

    const newBadges = await award(playerId, codes);

    const result: QuizResult = {
      attempt: {
        id: attempt.id,
        subSectionId: attempt.subSectionId,
        score: attempt.score,
        total: attempt.total,
        xpEarned: attempt.xpEarned,
        stars: attempt.stars,
        durationMs: attempt.durationMs,
        createdAt: attempt.createdAt.toISOString(),
      },
      answers: breakdown,
      profile: newBadges.length > 0 ? await getProfile(playerId) : profile,
      newBadges,
    };

    res.status(201).json({ data: result });
  }),
);

/** GET /api/subsections/:id/quiz/attempts - attempt history for the leaderboard. */
quizRouter.get(
  '/:id/quiz/attempts',
  asyncHandler(async (req, res) => {
    const playerId = await resolvePlayerId(req);
    await loadSubSectionOrThrow(req.params.id!);

    const attempts = await prisma.quizAttempt.findMany({
      where: { playerId, subSectionId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      data: attempts.map((a) => ({
        id: a.id,
        subSectionId: a.subSectionId,
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

/* ------------------------------------------------------------------ */
/* Individual question editing                                         */
/* ------------------------------------------------------------------ */

/** PUT /api/questions/:id */
questionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = createQuestionSchema.parse(req.body);
    const existing = await prisma.quizQuestion.findUnique({ where: { id: req.params.id } });
    if (!existing) throw HttpError.notFound('Question');

    const question = await prisma.quizQuestion.update({
      where: { id: existing.id },
      data: {
        prompt: input.prompt,
        options: JSON.stringify(input.options),
        correctIndex: input.correctIndex,
        explanation: input.explanation ?? null,
        difficulty: input.difficulty,
      },
    });

    res.json({ data: serializeQuestion(question, true) });
  }),
);

/** DELETE /api/questions/:id */
questionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.quizQuestion.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound('Question');

    await prisma.quizQuestion.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

import type {
  Card as CardDto,
  ProgressSummary,
  QuizQuestion as QuizQuestionDto,
  Section as SectionDto,
  SubSection as SubSectionDto,
  CardStatus,
  Difficulty,
  SectionTrack,
} from '@qa/shared';
import type { Card, QuizQuestion, Section, SubSection } from '@prisma/client';

/**
 * SQLite stores list fields as JSON text. A malformed value should degrade to an
 * empty list rather than take down the whole response.
 */
export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function serializeCard(card: Card, status?: CardStatus): CardDto {
  return {
    id: card.id,
    subSectionId: card.subSectionId,
    front: card.front,
    back: card.back,
    notes: card.notes,
    bullets: parseStringArray(card.bullets),
    sourceSlide: card.sourceSlide,
    order: card.order,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    ...(status ? { status } : {}),
  };
}

/**
 * `includeAnswer` must stay false while a quiz is being taken - otherwise the
 * correct index is sitting in the network tab.
 */
export function serializeQuestion(q: QuizQuestion, includeAnswer = false): QuizQuestionDto {
  return {
    id: q.id,
    subSectionId: q.subSectionId,
    prompt: q.prompt,
    options: parseStringArray(q.options),
    explanation: includeAnswer ? q.explanation : null,
    difficulty: q.difficulty as Difficulty,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    ...(includeAnswer ? { correctIndex: q.correctIndex } : {}),
  };
}

export function serializeSubSection(
  sub: SubSection,
  extras: { cards?: Card[]; cardCount?: number; quizQuestionCount?: number; progress?: ProgressSummary } = {},
): SubSectionDto {
  return {
    id: sub.id,
    sectionId: sub.sectionId,
    name: sub.name,
    description: sub.description,
    order: sub.order,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    ...(extras.cards ? { cards: extras.cards.map((c) => serializeCard(c)) } : {}),
    ...(extras.cardCount !== undefined ? { cardCount: extras.cardCount } : {}),
    ...(extras.quizQuestionCount !== undefined ? { quizQuestionCount: extras.quizQuestionCount } : {}),
    ...(extras.progress ? { progress: extras.progress } : {}),
  };
}

export function serializeSection(
  section: Section,
  extras: { subSections?: SubSectionDto[]; progress?: ProgressSummary } = {},
): SectionDto {
  return {
    id: section.id,
    name: section.name,
    slug: section.slug,
    description: section.description,
    track: section.track as SectionTrack,
    icon: section.icon,
    accent: section.accent,
    order: section.order,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
    ...(extras.subSections ? { subSections: extras.subSections } : {}),
    ...(extras.progress ? { progress: extras.progress } : {}),
  };
}

/** Combining diacritical marks, left behind by NFKD normalisation. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** URL-safe slug, de-duplicated by the caller when it collides. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'section';
}

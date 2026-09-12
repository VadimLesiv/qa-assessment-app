/**
 * Shared contract between the API and the web client.
 *
 * Everything the REST API returns is described here, so a change to a payload
 * shape breaks the build on both sides instead of at runtime in the browser.
 */

/** The two top-level tracks the assessment is split into. */
export type SectionTrack = 'PROCESS' | 'TECHNICAL';

/** How well the learner knows a given card. Drives the progress rings. */
export type CardStatus = 'NEW' | 'LEARNING' | 'KNOWN';

/** Difficulty of a quiz question. Higher difficulty is worth more XP. */
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Section {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  track: SectionTrack;
  /** Emoji or short glyph rendered on the section tile. */
  icon: string | null;
  /** Hex colour used for the tile gradient and progress ring. */
  accent: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  subSections?: SubSection[];
  progress?: ProgressSummary;
}

export interface SubSection {
  id: string;
  sectionId: string;
  name: string;
  description: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  cards?: Card[];
  /** Present on list endpoints so the UI can show "12 cards" without a second call. */
  cardCount?: number;
  quizQuestionCount?: number;
  progress?: ProgressSummary;
}

/**
 * A single flippable slide. `front` is what the learner sees first;
 * `back` holds the explanation revealed after the flip.
 */
export interface Card {
  id: string;
  subSectionId: string;
  front: string;
  back: string;
  /** Speaker notes carried over from an imported .pptx slide. */
  notes: string | null;
  /** Bullet points extracted from the source slide, rendered as a list. */
  bullets: string[];
  /** Slide number in the source deck, when the card came from an import. */
  sourceSlide: number | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  status?: CardStatus;
}

export interface QuizQuestion {
  id: string;
  subSectionId: string;
  prompt: string;
  options: string[];
  /** Never sent to the client while a quiz is in progress. */
  correctIndex?: number;
  explanation: string | null;
  difficulty: Difficulty;
  createdAt: string;
  updatedAt: string;
}

/** Aggregate counts used to render a progress ring at any level of the tree. */
export interface ProgressSummary {
  total: number;
  seen: number;
  known: number;
  learning: number;
  /** 0-100, rounded. Weighted: KNOWN counts 1.0, LEARNING counts 0.5. */
  percent: number;
}

export interface QuizAttempt {
  id: string;
  subSectionId: string;
  score: number;
  total: number;
  xpEarned: number;
  /** 0-5, the star rating shown on the results screen. */
  stars: number;
  durationMs: number;
  createdAt: string;
}

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string | null;
}

export interface PlayerProfile {
  id: string;
  name: string;
  xp: number;
  level: number;
  /** XP floor of the current level. */
  levelStartXp: number;
  /** XP required to reach the next level. */
  nextLevelXp: number;
  streakDays: number;
  lastActiveAt: string | null;
  badges: Badge[];
}

/** Result of parsing an uploaded .pptx, returned before anything is persisted. */
export interface ImportPreview {
  fileName: string;
  slideCount: number;
  cards: ImportedCard[];
}

export interface ImportedCard {
  front: string;
  back: string;
  bullets: string[];
  notes: string | null;
  sourceSlide: number;
}

/** Uniform error body for every non-2xx response. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level messages, present on 400 validation failures. */
    details?: Record<string, string[]>;
  };
}

/* ------------------------------------------------------------------ */
/* Request bodies                                                      */
/* ------------------------------------------------------------------ */

export interface CreateSectionInput {
  name: string;
  track: SectionTrack;
  description?: string | null;
  icon?: string | null;
  accent?: string | null;
}

export type UpdateSectionInput = Partial<CreateSectionInput> & { order?: number };

export interface CreateSubSectionInput {
  name: string;
  description?: string | null;
}

export type UpdateSubSectionInput = Partial<CreateSubSectionInput> & {
  order?: number;
  /** Move the sub-section to a different section. */
  sectionId?: string;
};

export interface CreateCardInput {
  front: string;
  back: string;
  notes?: string | null;
  bullets?: string[];
}

export type UpdateCardInput = Partial<CreateCardInput> & { order?: number };

export interface SubmitQuizInput {
  answers: { questionId: string; selectedIndex: number }[];
  durationMs: number;
}

export interface QuizResult {
  attempt: QuizAttempt;
  /** Per-question breakdown so the UI can show what went wrong. */
  answers: {
    questionId: string;
    prompt: string;
    selectedIndex: number;
    correctIndex: number;
    correct: boolean;
    explanation: string | null;
  }[];
  profile: PlayerProfile;
  /** Badges unlocked by this attempt, for the celebration toast. */
  newBadges: Badge[];
}

/* ------------------------------------------------------------------ */
/* Gamification rules - shared so the UI can predict rewards           */
/* ------------------------------------------------------------------ */

export const XP_PER_CARD_FLIPPED = 5;
export const XP_PER_CARD_KNOWN = 15;
export const XP_PER_CORRECT_ANSWER: Record<Difficulty, number> = {
  EASY: 10,
  MEDIUM: 20,
  HARD: 35,
};
export const XP_PERFECT_QUIZ_BONUS = 50;

/** Level N starts at 100 * N * (N-1) / 2 XP, so each level costs 100 more than the last. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpForLevel(level: number): number {
  return (100 * level * (level - 1)) / 2;
}

/** Convert a quiz percentage into a 0-5 star rating. */
export function starsForScore(score: number, total: number): number {
  if (total === 0) return 0;
  const pct = (score / total) * 100;
  if (pct >= 95) return 5;
  if (pct >= 80) return 4;
  if (pct >= 65) return 3;
  if (pct >= 50) return 2;
  if (pct > 0) return 1;
  return 0;
}

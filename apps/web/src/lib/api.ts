import type {
  ApiError,
  AuthResult,
  Badge,
  Card,
  CardStatus,
  CreateCardInput,
  CreateSectionInput,
  CreateSubSectionInput,
  ImportPreview,
  LeaderboardEntry,
  LoginInput,
  PlayerProfile,
  ProgressSummary,
  QuizQuestion,
  QuizResult,
  RegisterInput,
  ReorderSectionsInput,
  ReorderSubSectionsInput,
  Section,
  SubSection,
  SubmitQuizInput,
  UpdateCardInput,
  UpdateSectionInput,
  UpdateSubSectionInput,
} from '@qa/shared';

/** Vite proxies /api to the backend in dev, so a relative base works everywhere. */
const BASE = '/api';

const TOKEN_KEY = 'qa.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Thrown for any non-2xx response, carrying the server's structured detail. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Flattens field errors into a single line for inline form display. */
  get fieldSummary(): string {
    if (!this.details) return this.message;
    return Object.entries(this.details)
      .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
      .join(' · ');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // FormData sets its own multipart boundary, so only set JSON explicitly.
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = (payload as ApiError | null)?.error;
    if (response.status === 401) setToken(null);
    throw new ApiRequestError(
      response.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed with ${response.status}`,
      err?.details,
    );
  }

  return (payload as { data: T }).data;
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export const api = {
  listSections: (track?: 'PROCESS' | 'TECHNICAL') =>
    request<Section[]>(`/sections${track ? `?track=${track}` : ''}`),

  getSection: (id: string) => request<Section>(`/sections/${id}`),

  createSection: (input: CreateSectionInput) =>
    request<Section>('/sections', { method: 'POST', body: JSON.stringify(input) }),

  updateSection: (id: string, input: UpdateSectionInput) =>
    request<Section>(`/sections/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteSection: (id: string) => request<void>(`/sections/${id}`, { method: 'DELETE' }),

  /** Persists a drag-and-drop reshuffle of the section list. */
  reorderSections: (ids: string[]) =>
    request<void>('/sections/reorder', { method: 'PUT', body: JSON.stringify({ ids } satisfies ReorderSectionsInput) }),

  /* ---------------------------------------------------------------- */
  /* Sub-sections                                                      */
  /* ---------------------------------------------------------------- */

  listSubSections: (sectionId: string) => request<SubSection[]>(`/sections/${sectionId}/subsections`),

  getSubSection: (id: string) => request<SubSection & { cards: Card[] }>(`/subsections/${id}`),

  createSubSection: (sectionId: string, input: CreateSubSectionInput) =>
    request<SubSection>(`/sections/${sectionId}/subsections`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateSubSection: (id: string, input: UpdateSubSectionInput) =>
    request<SubSection>(`/subsections/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteSubSection: (id: string) => request<void>(`/subsections/${id}`, { method: 'DELETE' }),

  /** Reorders decks and/or moves them between sections in one atomic call. */
  reorderSubSections: (groups: ReorderSubSectionsInput['groups']) =>
    request<void>('/subsections/reorder', {
      method: 'PUT',
      body: JSON.stringify({ groups } satisfies ReorderSubSectionsInput),
    }),

  /* ---------------------------------------------------------------- */
  /* Cards                                                             */
  /* ---------------------------------------------------------------- */

  listCards: (subSectionId: string) => request<Card[]>(`/subsections/${subSectionId}/cards`),

  getCard: (id: string) => request<Card>(`/cards/${id}`),

  createCard: (subSectionId: string, input: CreateCardInput) =>
    request<Card>(`/subsections/${subSectionId}/cards`, { method: 'POST', body: JSON.stringify(input) }),

  updateCard: (id: string, input: UpdateCardInput) =>
    request<Card>(`/cards/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteCard: (id: string) => request<void>(`/cards/${id}`, { method: 'DELETE' }),

  setCardProgress: (id: string, status: CardStatus, flipped: boolean) =>
    request<{
      cardId: string;
      status: CardStatus;
      flips: number;
      xpEarned: number;
      deckProgress: ProgressSummary;
      profile: PlayerProfile;
      newBadges: Badge[];
    }>(`/cards/${id}/progress`, { method: 'PUT', body: JSON.stringify({ status, flipped }) }),

  /* ---------------------------------------------------------------- */
  /* PowerPoint import                                                 */
  /* ---------------------------------------------------------------- */

  /** Parses the deck and returns draft cards without saving them. */
  previewImport: (subSectionId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<ImportPreview>(`/subsections/${subSectionId}/import?preview=true`, {
      method: 'POST',
      body,
    });
  },

  commitImport: (subSectionId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{ imported: number; slideCount: number; cards: Card[]; newBadges: Badge[] }>(
      `/subsections/${subSectionId}/import`,
      { method: 'POST', body },
    );
  },

  /* ---------------------------------------------------------------- */
  /* Quiz                                                              */
  /* ---------------------------------------------------------------- */

  getQuiz: (subSectionId: string) => request<QuizQuestion[]>(`/subsections/${subSectionId}/quiz`),

  generateQuiz: (subSectionId: string, replace = false) =>
    request<QuizQuestion[]>(`/subsections/${subSectionId}/quiz/generate?replace=${replace}`, {
      method: 'POST',
    }),

  submitQuiz: (subSectionId: string, input: SubmitQuizInput) =>
    request<QuizResult>(`/subsections/${subSectionId}/quiz/attempts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /* ---------------------------------------------------------------- */
  /* Player                                                            */
  /* ---------------------------------------------------------------- */

  getProfile: () => request<PlayerProfile>('/profile'),

  renameProfile: (name: string) =>
    request<PlayerProfile>('/profile', { method: 'PUT', body: JSON.stringify({ name }) }),

  getProgress: () =>
    request<{ overall: ProgressSummary; process: ProgressSummary; technical: ProgressSummary }>(
      '/progress',
    ),

  /* ---------------------------------------------------------------- */
  /* Auth                                                              */
  /* ---------------------------------------------------------------- */

  register: (input: RegisterInput) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  login: (input: LoginInput) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  me: () => request<PlayerProfile>('/auth/me'),

  /* ---------------------------------------------------------------- */
  /* Leaderboard                                                       */
  /* ---------------------------------------------------------------- */

  getLeaderboard: () => request<LeaderboardEntry[]>('/leaderboard'),
};

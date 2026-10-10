# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Gamified QA study platform: npm-workspaces monorepo with an Express + Prisma (Postgres) API, a React 18 + Vite web client, and a shared types/rules package.

- `apps/api` (`@qa/api`) — Express REST API, ESM TypeScript, Prisma
- `apps/web` (`@qa/web`) — React + Vite SPA
- `packages/shared` (`@qa/shared`) — API payload types **and** the XP/level/star formulas, used by both apps. Must be built (`npm run build --workspace @qa/shared`) before the API or web build/typecheck picks up changes (consumers read `dist/`).
- `tests/e2e` — Playwright specs; `apps/api/tests` — Vitest

## Commands

Setup: `cp .env.example apps/api/.env`, set `DATABASE_URL` and `TEST_DATABASE_URL`, then `npm run db:push` and `npm run db:seed`. `npm test` runs API Vitest only; `npm run test:e2e` (Playwright) starts or reuses `npm run dev`.

Single test: `npm test --workspace @qa/api -- -t "name"` or `npx vitest run tests/api.test.ts` from `apps/api`.

`npm run db:reset` is destructive (drops and re-seeds); leave Prisma's agent-consent guard in place and don't run it without the user's explicit OK.

## Architecture notes

- **API wiring**: `apps/api/src/app.ts` is a `createApp()` factory (tests mount it with supertest; `server.ts` only binds the port). Route order matters — `nestedSubSectionsRouter` must be mounted before `sectionsRouter` on `/api/sections`. `/api/progress` is an alias that rewrites into `profileRouter`.
- **Response envelope**: success is `{ data }`, errors are `{ error: { code, message, details? } }` (see `lib/errors.ts`). Request validation uses zod.
- **Auth**: JWT bearer (30-day, no session store). `Player` doubles as the account; all learner state (`CardProgress`, `QuizAttempt`, `EarnedBadge`) is keyed by `playerId`, resolved from the token (`lib/auth.ts`, `lib/player.ts`).
- **Tracks**: `Track` rows (key, name, colour…) group sections; `Section.track` stores the key. `PROCESS`/`TECHNICAL` are seeded lazily by `lib/tracks.ts` when the table is empty, and managers can add more via `/api/tracks`.
- **Data model**: `Section` → `SubSection` (a deck) → `Card`; `QuizQuestion` hangs off a sub-section. Card bullets and quiz options are stored as JSON strings and (de)serialized only in `lib/serialize.ts`. (The DB is Postgres, but the JSON-string storage remains.)
- **Quiz answers**: `correctIndex` is never sent to the client until grading; keep it that way (e2e checks it).
- **Progress cards** are idempotent: `PUT /cards/:id/progress` with an unchanged status awards no XP. XP/badge/streak logic lives in `lib/progress.ts`, `lib/badges.ts`; rules are defined in `packages/shared/src/index.ts`.
- **PPTX import** (`services/pptx.ts`): reads only `ppt/slides/*.xml` and notes via unzipper + fast-xml-parser; previews before saving; appends to a deck. Upload cap is `MAX_UPLOAD_BYTES` (default 100 MB). Text-only import (image-only slides skipped).
- **Quiz generation** (`services/quizgen.ts`): uses `ANTHROPIC_API_KEY` if set, otherwise a deterministic local generator.
- **Web**: talks to relative `/api` (`apps/web/src/lib/api.ts`); Vite proxies it in dev (`API_URL` overrides target), Netlify proxies it to the Render API in prod, so there is no CORS in practice.

## Testing gotchas

- Vitest runs against a separate Postgres DB via `TEST_DATABASE_URL`; `tests/setup.ts` refuses to run unless its name contains "test" because tests truncate tables. It runs `prisma db push` in `beforeAll`. Files run serially (`fileParallelism: false`).
- Playwright runs serially (shared server state) and hits whatever DB the dev API uses.
- Skills: `start-application` (project) launches the app; `run_tests` is a user-level skill carried over from the flashcard project, so check it fits this repo before relying on it.

## Deployment

- API on Render (`render.yaml`), web on Netlify (`netlify.toml`). The API start path is `apps/api/dist/src/server.js` because tsc emits under `dist/src`; the Render build also runs `prisma db push` against the production DB.

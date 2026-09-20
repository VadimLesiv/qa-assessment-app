# QA Assessment

A gamified study platform for QA engineers preparing for a QA assessment — and a
practice ground for QA automation, AI engineering and web development.

Study decks behave like a slide presentation you can flip through card by card.
Progress rings fill as you master each card, quizzes score you with a star
rating, and XP, levels, streaks and badges keep the loop rewarding.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [REST API](#rest-api)
- [Importing PowerPoint decks](#importing-powerpoint-decks)
- [Gamification rules](#gamification-rules)
- [Testing](#testing)
- [Using this repo to practise](#using-this-repo-to-practise)
- [Troubleshooting](#troubleshooting)

---

## Features

**Studying**
- Presentation-style cards with a real 3D flip — click, or press <kbd>Space</kbd>
- Per-deck, per-section and overall progress rings that update as you go
- Three-state mastery per card: `NEW` → `LEARNING` → `KNOWN`
- Keyboard-first drilling: <kbd>←</kbd> <kbd>→</kbd> navigate, <kbd>K</kbd> known, <kbd>L</kbd> still learning
- A dot strip under the card doubles as a status map of the whole deck

**Accounts**
- Email/password sign-up and sign-in, JWT-based
- Every learner's XP, streak and quiz history is scoped to their own account
- A live leaderboard ranks every registered player by total XP

**Assessment**
- Two tracks, seeded with real content: **Process** and **Technical**
- Multiple-choice quizzes with difficulty-weighted XP and a 0–5 star rating
- Per-question review after grading, with explanations
- Answers are graded server-side and never sent to the browser mid-quiz
- Quizzes can be generated automatically from a deck's cards

**Authoring**
- Create, rename and delete sections, sub-sections (decks) and cards
- Write flashcards by hand, or import a `.pptx` and turn every slide into a card
- Import preview shows exactly what will be created before anything is saved
- Move a deck between sections; reorder cards

**Gamification**
- XP, levels on a rising curve, daily study streaks
- Ten unlockable badges with a visible "locked" shelf so goals stay in sight
- Toast celebrations for XP gains and badge unlocks

---

## Quick start

Requires **Node.js 20+** (built and tested on 24.15).

```bash
git clone <your-remote> qa-assessment-app
cd qa-assessment-app

npm install

# Configure the API
cp .env.example apps/api/.env

# Create the SQLite schema and load the starter curriculum
npm run db:push
npm run db:seed

# Start the API (:4000) and the web client (:5173) together
npm run dev
```

Open **http://localhost:5173**.

The seed loads 6 sections, 10 decks, 53 cards and 30 quiz questions covering
testing principles, the SDLC/STLC, test planning, defect management, Agile QA,
black- and white-box test design, automation practice, REST API testing and
performance testing.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web client with hot reload |
| `npm run build` | Type-check and build both apps for production |
| `npm test` | API unit and integration tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright); starts the servers itself |
| `npm run test:e2e:ui` | Playwright in interactive UI mode |
| `npm run db:push` | Apply the Prisma schema to SQLite |
| `npm run db:seed` | Load (or reload) the starter curriculum |
| `npm run db:reset` | **Destructive.** Drop everything and re-seed |

> `npm run db:reset` erases all data including your progress. Prisma will refuse
> to run it from an AI agent without explicit consent — that guard is
> intentional, leave it in place.

---

## Architecture

```
qa-assessment-app/
├── apps/
│   ├── api/                     Express + TypeScript REST API
│   │   ├── prisma/
│   │   │   ├── schema.prisma    Data model
│   │   │   └── seed.ts          Starter curriculum
│   │   ├── src/
│   │   │   ├── app.ts           App factory (mountable in tests)
│   │   │   ├── server.ts        HTTP entry point
│   │   │   ├── lib/             Prisma client, errors, XP, badges, progress
│   │   │   ├── routes/          sections · subsections · cards · quiz · profile
│   │   │   └── services/        .pptx parser · quiz generator
│   │   └── tests/               Vitest suites + .pptx fixture builder
│   └── web/                     React 18 + Vite + TypeScript
│       └── src/
│           ├── components/      Flip card, progress ring, HUD, modals, toasts
│           ├── pages/           Dashboard · Section · Study · Quiz · Manage · Profile
│           ├── lib/             Typed API client, player context
│           └── styles/          Design tokens and the game theme
├── packages/shared/             Types + gamification rules shared by both apps
└── tests/e2e/                   Playwright specs
```

**Why this shape**

- `packages/shared` holds every API payload type *and* the XP formulas. The
  client predicts rewards using the same functions the server scores with, so
  the two can never drift.
- `createApp()` is a factory, so integration tests mount the real app with
  supertest without binding a port.
- The web client talks to a relative `/api` path; Vite proxies it in dev, which
  keeps the browser on one origin and avoids CORS entirely.

**Data model**

`Section` (track: PROCESS | TECHNICAL) → `SubSection` (a deck) → `Card`, with
`QuizQuestion` attached to a sub-section. Learner state lives in `Player`,
`CardProgress`, `QuizAttempt` and `EarnedBadge`. `Player` doubles as the
account: `email` and `passwordHash` are set on sign-up, and every other
learner row is keyed by `playerId`.

**Auth**

Sign-up and sign-in issue a JWT (`Authorization: Bearer <token>`, 30-day
expiry) identifying the player; there is no session store. Every route that
reads or writes learner state resolves the caller from that token, so all
of `/profile`, `/progress`, card progress and quiz attempts are scoped to
the signed-in player automatically. The one pre-account `Player` row a
fresh clone seeds via manual use is claimed by whoever registers first,
rather than being stranded.

SQLite has no array type, so card bullets and quiz options are stored as JSON
strings and parsed in one serializer layer.

---

## REST API

Base URL `http://localhost:4000/api`. All responses are wrapped in `{ "data": … }`;
errors use `{ "error": { code, message, details? } }`.

### Auth

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an account, returns `{ token, profile }` |
| `POST` | `/auth/login` | Sign in with email + password, returns `{ token, profile }` |
| `GET` | `/auth/me` | Resolve the current token back to a profile, for session restore |

Every other route below requires `Authorization: Bearer <token>`.

### Leaderboard

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/leaderboard` | All registered players, ranked by total XP |

### Sections

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/sections` | Full tree with progress. `?track=PROCESS\|TECHNICAL` filters |
| `GET` | `/sections/:id` | One section with its decks |
| `POST` | `/sections` | Create |
| `PUT` | `/sections/:id` | Rename, re-theme, reorder, change track |
| `DELETE` | `/sections/:id` | Delete (cascades to decks and cards) |

### Sub-sections (decks)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/sections/:id/subsections` | List decks in a section |
| `POST` | `/sections/:id/subsections` | Create a deck |
| `GET` | `/subsections/:id` | Deck with its cards and this player's statuses |
| `PUT` | `/subsections/:id` | Rename, reorder, or move to another section |
| `DELETE` | `/subsections/:id` | Delete |

### Cards

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/subsections/:id/cards` | List cards in a deck |
| `POST` | `/subsections/:id/cards` | Create a card |
| `GET` | `/cards/:id` | Read one card |
| `PUT` | `/cards/:id` | Update (partial; omitted fields are left alone) |
| `DELETE` | `/cards/:id` | Delete |
| `PUT` | `/cards/:id/progress` | Set mastery, award XP — idempotent |

### Quiz

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/subsections/:id/quiz` | Questions **without** answers |
| `POST` | `/subsections/:id/quiz/generate` | Build questions from the deck's cards (`?replace=true`) |
| `POST` | `/subsections/:id/quiz/questions` | Add a question by hand |
| `POST` | `/subsections/:id/quiz/attempts` | Submit and grade an attempt |
| `GET` | `/subsections/:id/quiz/attempts` | Attempt history |
| `PUT` | `/questions/:id` | Edit a question |
| `DELETE` | `/questions/:id` | Delete a question |

### Player

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/profile` | XP, level, streak, badge shelf |
| `PUT` | `/profile` | Rename the player |
| `GET` | `/profile/attempts` | Recent quiz history |
| `GET` | `/progress` | Overall / per-track rollup |
| `GET` | `/health` | Liveness check |

**Example**

```bash
# Edit a card
curl -X PUT http://localhost:4000/api/cards/<id> \
  -H 'Content-Type: application/json' \
  -d '{"front":"What is the pesticide paradox?","bullets":["Rotate test data"]}'

# Mark it mastered
curl -X PUT http://localhost:4000/api/cards/<id>/progress \
  -H 'Content-Type: application/json' \
  -d '{"status":"KNOWN","flipped":true}'
```

Two notes worth knowing:

- **`correctIndex` is never sent while a quiz is in progress.** It appears only
  in the graded response, so the answer key is not sitting in the network tab.
- **`PUT /cards/:id/progress` is idempotent.** Re-sending the same status awards
  no further XP, so a double-click or a retry cannot inflate your score.

---

## Importing PowerPoint decks

A `.pptx` is a ZIP of XML parts. The importer reads only `ppt/slides/slideN.xml`
and the matching `ppt/notesSlides/notesSlideN.xml`, which avoids a heavyweight
Office dependency.

Per slide:

| Slide element | Becomes |
| --- | --- |
| First text run (the title) | Card **front** |
| Remaining text runs | Card **bullets**, joined into the **back** |
| Speaker notes | Card **notes** (and the back, if the slide has no bullets) |
| Slide number | `sourceSlide`, shown on the card |

Slides with no text at all (image-only) are skipped. Upload is capped at 25 MB
(`MAX_UPLOAD_BYTES`) and non-`.pptx` files are rejected with a `415`.

In the UI: **Manage → Import** on any deck. The file is parsed and previewed
first; nothing is written until you confirm. Imports **append** to a deck rather
than replacing it.

---

## Gamification rules

Defined once in `packages/shared/src/index.ts` and used by both apps.

| Action | XP |
| --- | --- |
| Flip a card for the first time | 5 |
| Mark a card as known | 15 |
| Correct answer — easy / medium / hard | 10 / 20 / 35 |
| Perfect quiz bonus | 50 |

**Levels.** Level *N* begins at `100 × N × (N−1) / 2` XP, so each level costs
100 XP more than the last: level 2 at 100, level 3 at 300, level 4 at 600.

**Stars.** ≥95% → 5 ★ · ≥80% → 4 ★ · ≥65% → 3 ★ · ≥50% → 2 ★ · >0 → 1 ★

**Progress %.** A `KNOWN` card counts 1.0 and a `LEARNING` card 0.5, so the ring
moves on your first pass through a deck instead of sitting at zero until the end.

**Streaks.** Returning the next calendar day extends the streak; a second
session the same day does not double-count; a missed day resets it to 1.

**Badges.** First Flip · Deck Master · Quiz Rookie · Flawless · Five Star ·
On a Roll (3-day streak) · Unstoppable (7-day) · Rising Star (level 5) ·
QA Veteran (level 10) · Deck Builder (first import).

---

## Testing

```bash
npm test           # 62 Vitest tests: unit + API integration
npm run test:e2e   # 12 Playwright browser tests
```

**Vitest** (`apps/api/tests/`) covers the REST surface with supertest against a
real app instance, the `.pptx` parser, the quiz generator, and the XP, level,
star, progress and streak formulas.

The suite runs against a **separate `test.db`** that is created and destroyed per
run. `tests/setup.ts` refuses to start if `DATABASE_URL` does not point at a
test database — the suite truncates tables between tests, so that guard is what
stops it from ever wiping your development data.

`tests/helpers/pptx.ts` builds real `.pptx` files in memory with JSZip, so import
tests exercise the actual ZIP and XML path rather than a mock.

**Playwright** (`tests/e2e/`) drives the browser: flipping cards, keyboard
shortcuts, XP toasts, a full quiz run to the star rating, section/deck/card CRUD,
and a check that the answer key never reaches the DOM mid-quiz. It starts the
dev servers itself, reusing yours if they are already running.

---

## Using this repo to practise

The app is deliberately shaped as a practice target:

**QA automation** — a stable, seeded app with a real REST API behind it. Test
IDs and ARIA roles are in place for resilient locators. Add API tests against
the endpoint table above, extend the Playwright suite, or point Selenium,
Cypress or RestAssured at it. The idempotent progress endpoint and the
"answers are never leaked" rule are both deliberately testable behaviours.

**AI engineering** — `apps/api/src/services/quizgen.ts` is an offline,
deterministic question generator behind a narrow interface. Swapping in an LLM
means replacing `generateFromCards` and keeping the same return shape.
`.env.example` already reserves `ANTHROPIC_API_KEY` for that. Natural next
steps: LLM-generated distractors, difficulty estimation, semantic answer
grading for free-text questions, and an eval harness comparing generated
questions against the deck.

**Web development** — React 18, typed end to end, no UI framework. The theme is
plain CSS custom properties in one file, so restyling is approachable. Obvious
extensions: spaced repetition scheduling, password reset, and a deck-sharing
export/import format.

---

## Troubleshooting

**Port already in use.** Change `PORT` in `apps/api/.env`, and `server.port` in
`apps/web/vite.config.ts`.

**`@prisma/client` did not initialize.** Run `npx prisma generate --schema apps/api/prisma/schema.prisma`.

**Empty dashboard.** The database has no content — run `npm run db:seed`.

**Import says "not a readable .pptx archive".** The file is likely a legacy
`.ppt`. Open it in PowerPoint and save as `.pptx`.

**Playwright can't find a browser.** Run `npx playwright install chromium`.

---

## Licence

Private project — not licensed for redistribution.

---
name: start-application
description: Run or check the QA Assessment app. The app is deployed (Render API + Netlify web), so verify the server first; start the API and web client locally only for dev work or uncommitted changes. Use when asked to run, start, launch, or serve the app, or to check a UI/CSS/API change in the browser.
---

# Start Application

## First: the app is already deployed

The app runs on a server, so **don't start a local copy unless the user asks
for local/dev mode or needs to test uncommitted changes**:

- **API** (Render, free tier): `https://qa-assessment-api.onrender.com`
- **Web** (Netlify): `https://resilient-treacle-8b3b9e.netlify.app`. Netlify
  proxies `/api/*` to the Render API.

Free-tier Render services sleep when idle, so the first request can take
30–60 s. Check it's up:

```bash
curl -s -i --max-time 90 https://qa-assessment-api.onrender.com/api/health
```

Expect `200` with `{"status":"ok", ...}`. If it fails, use the
`render:check-render-status` / `render:render-debug` skills. Changes only reach
the server after pushing to `main` (Render and Netlify auto-deploy); the Render
build also runs `prisma db push` against the production DB.

Never run `db:seed`, `db:push` or `db:reset` against the production
`DATABASE_URL`.

## Local development (only when requested)

This is a Node.js/TypeScript npm workspaces monorepo, **not** a single build:

- `apps/api` — Express + TypeScript REST API, backed by Postgres via Prisma.
  Runs on **port 4000**. Dev mode uses `tsx watch`.
- `apps/web` — React + Vite client. Runs on **port 5173** and proxies
  `/api/*` to the API (no CORS issues in dev).

Both need `apps/api/.env` configured (copied from `.env.example`) with a real
`DATABASE_URL` (e.g. a free Neon or Supabase Postgres project) before the API
will start successfully.

## Prerequisites (first run only)

```bash
npm install
cp .env.example apps/api/.env   # then fill in DATABASE_URL / TEST_DATABASE_URL
npm run db:push
npm run db:seed
```

Skip this if `apps/api/.env` already exists and has a real `DATABASE_URL`
(not the `user:password@host` placeholder) and the schema has already been
pushed/seeded.

## Command

```bash
npm run dev
```

This runs the API and web client concurrently (`concurrently`) and blocks in
the foreground. When starting it from Claude Code, run it with
`run_in_background: true` so the session isn't blocked.

To run just one side:

```bash
npm run dev:api   # API only, :4000
npm run dev:web   # web only, :5173
```

## Verifying it's up

```bash
curl -s -i http://localhost:4000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expect `HTTP/1.1 200 OK` with `{"status":"ok", ...}` from the API, and `200`
from the web client. Routes like `/api/sections` return `401` without a JWT
— that's expected, not a failure; it means the DB connection and auth
middleware are working.

Open **http://localhost:5173** in the browser to use the app.

## Picking up changes without restarting

- **API (`apps/api/src/**`)**: `tsx watch` reloads automatically on save.
- **Web (`apps/web/src/**`)**: Vite hot-module-reloads automatically; no
  restart or rebuild needed.
- **Prisma schema changes**: run `npm run db:push` to apply, then restart the
  API dev process to pick up the regenerated client.
- **Env var changes** (`apps/api/.env`): require restarting `npm run dev:api`
  (or the whole `npm run dev`).

## Notes

- `npm run db:reset` is destructive (drops and re-seeds all data) — never run
  it without explicit user consent.
- If `DATABASE_URL` still contains the placeholder value from
  `.env.example`, the API will fail to connect; point it at a real Postgres
  instance first.

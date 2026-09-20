import express from 'express';
import cors from 'cors';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { sectionsRouter } from './routes/sections.js';
import { nestedSubSectionsRouter, subSectionsRouter } from './routes/subsections.js';
import { cardsRouter } from './routes/cards.js';
import { questionsRouter, quizRouter } from './routes/quiz.js';
import { profileRouter } from './routes/profile.js';
import { authRouter } from './routes/auth.js';
import { leaderboardRouter } from './routes/leaderboard.js';

/**
 * Built as a factory so tests can mount the app with supertest without binding
 * a port or starting the real server.
 */
export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  // Order matters: the nested router owns /api/sections/:id/subsections.
  app.use('/api/sections', nestedSubSectionsRouter);
  app.use('/api/sections', sectionsRouter);
  app.use('/api/subsections', quizRouter);
  app.use('/api/subsections', subSectionsRouter);
  app.use('/api/cards', cardsRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/profile', profileRouter);
  // /api/progress is a sibling alias of the profile rollup.
  app.use('/api/progress', (req, res, next) => {
    req.url = '/progress';
    profileRouter(req, res, next);
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

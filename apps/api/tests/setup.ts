/**
 * Points every test at a throwaway SQLite file so a test run can never damage
 * the development database. The schema is pushed once before the suite starts.
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const TEST_DB = join(process.cwd(), 'prisma', 'test.db');

// Set before any test file imports the Prisma client. Prisma loads .env via
// dotenv, which never overwrites a variable that is already set, so this wins.
process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'test';

beforeAll(() => {
  // The suite truncates tables in beforeEach. If the client were ever pointed at
  // the development database that would silently destroy the seeded curriculum,
  // so refuse to run at all unless the target is unmistakably the test database.
  if (!process.env.DATABASE_URL?.includes('test.db')) {
    throw new Error(`Refusing to run tests against ${process.env.DATABASE_URL ?? '(unset)'}`);
  }

  for (const suffix of ['', '-journal']) {
    if (existsSync(TEST_DB + suffix)) rmSync(TEST_DB + suffix);
  }

  // The file was just deleted, so a plain push builds the schema from scratch.
  // --force-reset is deliberately avoided: it is a destructive operation, and
  // deleting the file above already guarantees a clean database.
  execSync('npx prisma db push --skip-generate', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  // Windows keeps the file locked until the connection pool is closed, so the
  // client must disconnect before the database file can be removed.
  const { prisma } = await import('../src/lib/prisma.js');
  await prisma.$disconnect();

  for (const suffix of ['', '-journal']) {
    try {
      if (existsSync(TEST_DB + suffix)) rmSync(TEST_DB + suffix, { force: true });
    } catch {
      // A leftover file is harmless - beforeAll deletes it on the next run.
    }
  }
});

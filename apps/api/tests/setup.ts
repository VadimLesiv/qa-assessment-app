/**
 * Points every test at a dedicated test database (TEST_DATABASE_URL) so a
 * test run can never damage the development database. The suite truncates
 * tables in beforeEach, so the target must be unmistakably a test database -
 * refuse to run otherwise.
 */
import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { afterAll, beforeAll } from 'vitest';

// Unlike `tsx` (used for dev/build), plain Vitest doesn't auto-load .env.
config();

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl?.includes('test')) {
  throw new Error(
    `Refusing to run tests against ${testUrl ?? '(unset)'}. Set TEST_DATABASE_URL to a ` +
      `dedicated Postgres database whose name includes "test".`,
  );
}

// Set before any test file imports the Prisma client. Prisma loads .env via
// dotenv, which never overwrites a variable that is already set, so this wins.
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';

// Neon's free tier scales to zero when idle, so the first connection of a
// run can take a while to wake the branch up - hence the generous timeout.
beforeAll(() => {
  execSync('npx prisma db push --skip-generate', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}, 30_000);

afterAll(async () => {
  const { prisma } = await import('../src/lib/prisma.js');
  await prisma.$disconnect();
});

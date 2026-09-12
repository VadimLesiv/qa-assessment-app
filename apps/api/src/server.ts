import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`QA Assessment API listening on http://localhost:${port}`);
});

/** Close the DB pool on shutdown so `tsx watch` restarts cleanly. */
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down.`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

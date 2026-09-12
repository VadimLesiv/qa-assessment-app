import { PrismaClient } from '@prisma/client';

/**
 * A single client is reused across the process. `tsx watch` re-evaluates modules
 * on every save, so without the global cache we would leak a connection pool
 * per reload during development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

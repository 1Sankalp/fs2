import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      },
    },
    // Set PostgreSQL specific connection options as a string parameter
    // to avoid the prepared statement already exists error
    datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&statement_cache_size=0&connect_timeout=10&idle_timeout=2",
  });
};

// Export prisma instance with proper scoping
export const prisma = globalForPrisma.prisma || prismaClientSingleton();

// If not in production, add the prisma client to the global object
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma; 
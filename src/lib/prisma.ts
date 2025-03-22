import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL + 
      "?pgbouncer=true" + 
      "&statement_cache_size=0" +  // Disable statement caching
      "&connect_timeout=15" +      // Longer connect timeout
      "&pool_timeout=15" +         // Pool timeout
      "&idle_timeout=5" +          // Shorter idle timeout
      "&application_name=email_scraper",  // Application name for tracking
  });
};

// In production, we don't use the global client at all to avoid prepared statement issues
// In development, we use a global client for faster refresh cycles
export const prisma = process.env.NODE_ENV === 'production' 
  ? prismaClientSingleton() 
  : (globalForPrisma.prisma || prismaClientSingleton());

// If not in production, add the prisma client to the global object
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma; 
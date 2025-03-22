import { PrismaClient } from '@prisma/client';

// Create a new client with completely disabled connection pooling
export const prismaClientSingleton = () => {
  // Force use of direct URL without pooling and no statement caching
  let url = process.env.DATABASE_URL;
  
  // Ensure we're using a direct URL, not a pooled one
  if (url?.includes('pgbouncer=true')) {
    url = url.replace('pgbouncer=true', 'pgbouncer=false');
  }
  
  // Add non-pooling parameters
  url = url + 
    "?connection_limit=1" + 
    "&pool_timeout=0" +
    "&statement_cache_size=0" +
    "&connect_timeout=30";
    
  return new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: url,
  });
};

// Always use a fresh client, never a shared one
export const prisma = prismaClientSingleton();

// Avoid modifying global object entirely
const globalForPrisma = global as unknown as { prisma: undefined };
globalForPrisma.prisma = undefined; 
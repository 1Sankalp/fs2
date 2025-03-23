import { PrismaClient } from '@prisma/client';

// Add global declaration for PrismaClient instances
declare global {
  var prisma: PrismaClient | undefined;
}

// Connection counter to track when clients are created
let connectionCounter = 0;

/**
 * This creates a fresh PrismaClient instance each time it's called.
 * Each instance has a unique query engine to avoid prepared statement conflicts.
 * Use this when you need a completely isolated client for a specific operation.
 */
export function prismaClientSingleton() {
  const connectionId = ++connectionCounter;
  console.log(`Creating new Prisma client instance #${connectionId}`);
  
  // Add a statement cache size of 0 and a unique identifier to avoid statement conflicts
  const url = process.env.DATABASE_URL || '';
  const uniqueUrl = url.includes('?') 
    ? `${url}&connection_limit=1&pool_timeout=0&statement_cache_size=0&connection_id=${connectionId}`
    : `${url}?connection_limit=1&pool_timeout=0&statement_cache_size=0&connection_id=${connectionId}`;
  
  return new PrismaClient({
    datasourceUrl: uniqueUrl,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/**
 * Global shared instance - only use this for read-only operations!
 * For write operations or anything that needs to be reliable, use prismaClientSingleton()
 */
export const prisma = global.prisma || (global.prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
}));

if (process.env.NODE_ENV !== 'production') global.prisma = prisma; 
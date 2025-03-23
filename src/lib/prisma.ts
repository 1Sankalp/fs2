import { PrismaClient } from '@prisma/client';

// Add global declaration for PrismaClient instances
declare global {
  var prisma: PrismaClient | undefined;
}

// Connection counter to track when clients are created
let connectionCounter = 0;
let connectionRetries = 0;
const MAX_RETRIES = 3;

/**
 * This creates a fresh PrismaClient instance each time it's called.
 * Each instance has a unique query engine to avoid prepared statement conflicts.
 * Use this when you need a completely isolated client for a specific operation.
 */
export function prismaClientSingleton() {
  const connectionId = ++connectionCounter;
  console.log(`Creating new Prisma client instance #${connectionId}`);
  
  try {
    // Add a statement cache size of 0 and a unique identifier to avoid statement conflicts
    const url = process.env.DATABASE_URL || '';
    
    if (!url) {
      console.error('DATABASE_URL is not defined in environment variables');
      throw new Error('Database connection string is missing');
    }
    
    // Use non-pooling URL for single operations
    const baseUrl = process.env.POSTGRES_URL_NON_POOLING || url;
    
    const uniqueUrl = baseUrl.includes('?') 
      ? `${baseUrl}&connection_limit=1&pool_timeout=20&connect_timeout=10&statement_cache_size=0&connection_id=${connectionId}`
      : `${baseUrl}?connection_limit=1&pool_timeout=20&connect_timeout=10&statement_cache_size=0&connection_id=${connectionId}`;
    
    const prismaClient = new PrismaClient({
      datasourceUrl: uniqueUrl,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
    
    // Add a $connect with retry mechanism
    const originalConnect = prismaClient.$connect.bind(prismaClient);
    prismaClient.$connect = async () => {
      let lastError;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`Connection attempt ${attempt} for client #${connectionId}`);
          return await originalConnect();
        } catch (error) {
          lastError = error;
          console.error(`Connection attempt ${attempt} failed:`, error);
          
          if (attempt < MAX_RETRIES) {
            // Exponential backoff: 500ms, 1500ms, 4500ms, etc.
            const delay = Math.pow(3, attempt - 1) * 500;
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError;
    };
    
    return prismaClient;
  } catch (error) {
    console.error('Failed to create Prisma client:', error);
    // Fallback to a simple client as last resort
    return new PrismaClient();
  }
}

/**
 * Global shared instance - only use this for read-only operations!
 * For write operations or anything that needs to be reliable, use prismaClientSingleton()
 */
export const prisma = global.prisma || (global.prisma = (() => {
  try {
    console.log('Creating global Prisma client instance');
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (error) {
    console.error('Failed to create global Prisma client:', error);
    throw error; // Re-throw so the app fails fast if global client can't be created
  }
})());

if (process.env.NODE_ENV !== 'production') global.prisma = prisma; 
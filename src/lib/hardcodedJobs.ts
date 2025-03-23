// Create an in-memory job storage for hardcoded users
// This is shared across routes to maintain state between requests

// Note: This will be reset on server restarts as it's in-memory storage
// In production, you should use a database or persistent storage
import { prismaClientSingleton } from './prisma';

export const hardcodedJobs = new Map<string, any>();

// Debug function to print all in-memory jobs
export function logAllJobs() {
  console.log(`In-memory jobs map status - Size: ${hardcodedJobs.size}`);
  hardcodedJobs.forEach((job, id) => {
    console.log(`Memory job: ${id} - User: ${job.userId} - Status: ${job.status} - Created: ${job.createdAt}`);
  });
}

// Function to sync in-memory job progress to database
// Call this periodically to ensure job progress is saved to DB
export async function syncJobToDatabase(jobId: string) {
  if (!hardcodedJobs.has(jobId)) {
    console.log(`Job ${jobId} not found in memory store for syncing`);
    return false;
  }

  const job = hardcodedJobs.get(jobId);
  if (!job) return false;
  
  try {
    const prisma = prismaClientSingleton();
    
    console.log(`Syncing job ${jobId} to database - Status: ${job.status}, Progress: ${job.progress}`);
    
    // Update the job in the database with current progress and status
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: job.status,
        progress: job.progress || 0
      }
    });
    
    // Sync results if they exist
    if (job.results && job.results.length > 0) {
      console.log(`Syncing ${job.results.length} results for job ${jobId}`);
      
      // For each result that doesn't exist in the database yet
      for (const result of job.results) {
        // Check if the result already exists (costly but necessary)
        const existingResult = await prisma.result.findFirst({
          where: {
            jobId: jobId,
            website: result.website
          }
        });
        
        if (!existingResult) {
          // Create the result in the database
          await prisma.result.create({
            data: {
              jobId: jobId,
              website: result.website,
              email: result.email
            }
          });
        }
      }
    }
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error(`Error syncing job ${jobId} to database:`, error);
    return false;
  }
}

// Initialize hardcoded jobs from database on startup
// This helps restore state after server restarts
export async function loadJobsFromDatabase() {
  if (hardcodedJobs.size > 0) {
    console.log("In-memory jobs already exist, skipping database load");
    return;
  }
  
  try {
    console.log("Loading hardcoded user jobs from database");
    const prisma = prismaClientSingleton();
    
    // Find all jobs for hardcoded users
    const dbJobs = await prisma.job.findMany({
      where: {
        userId: {
          startsWith: 'hardcoded-'
        }
      },
      include: {
        results: true
      }
    });
    
    console.log(`Found ${dbJobs.length} jobs for hardcoded users in database`);
    
    // Add each job to the in-memory store
    for (const job of dbJobs) {
      hardcodedJobs.set(job.id, {
        id: job.id,
        name: job.name,
        status: job.status,
        sheetUrl: job.sheetUrl,
        columnName: job.columnName,
        totalWebsites: job.totalUrls,
        processedWebsites: job.results.length,
        progress: job.progress || 0,
        results: job.results.map(r => ({
          website: r.website,
          email: r.email
        })),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        userId: job.userId
      });
    }
    
    await prisma.$disconnect();
    console.log(`Loaded ${hardcodedJobs.size} jobs into memory store`);
  } catch (error) {
    console.error("Error loading jobs from database:", error);
  }
}

// Initialize with some dummy jobs for debugging if needed
// This can be called from other files to maintain state
export function initializeMemoryJobs() {
  if (process.env.NODE_ENV !== 'production' && hardcodedJobs.size === 0) {
    console.log("Initializing in-memory jobs map for development");
    
    // Add test jobs if needed
    // const testJobId = `job-test-${Date.now()}`;
    // hardcodedJobs.set(testJobId, {...});
  }
} 
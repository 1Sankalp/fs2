// Create an in-memory job storage for hardcoded users
// This is shared across routes to maintain state between requests

// Note: This will be reset on server restarts as it's in-memory storage
// In production, you should use a database or persistent storage
import { prismaClientSingleton } from './prisma';
import { v4 as uuidv4 } from 'uuid';

interface HardcodedJob {
  id: string;
  name: string;
  status: string;
  sheetUrl: string;
  columnName: string;
  createdAt: string;
  updatedAt: string;
  totalWebsites?: number;
  processedWebsites?: number;
  progress?: number;
  userId: string;
  results: { website: string; email: string | null }[];
}

// Type for database job with results
interface DbJobWithResults {
  id: string;
  name: string | null;
  status: string;
  sheetUrl: string;
  columnName: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  totalUrls: number | null;
  results: Array<{
    website: string;
    email: string | null;
  }>;
}

// Create a result type that matches the Prisma schema
type ResultType = {
  website: string;
  email: string | null;
};

// In-memory job storage
const jobsMap = new Map<string, HardcodedJob>();

// Initialize from localStorage on startup if available (client-side only)
const initializeFromStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      const storedJobs = localStorage.getItem('hardcodedJobs');
      if (storedJobs) {
        const parsedJobs = JSON.parse(storedJobs);
        if (Array.isArray(parsedJobs)) {
          console.log(`Loading ${parsedJobs.length} jobs from localStorage`);
          parsedJobs.forEach(job => {
            jobsMap.set(job.id, job);
          });
        }
      }
    } catch (error) {
      console.error('Error loading jobs from localStorage:', error);
    }
  }
};

// Save to localStorage
const saveToStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      const jobsArray = Array.from(jobsMap.values());
      localStorage.setItem('hardcodedJobs', JSON.stringify(jobsArray));
      console.log(`Saved ${jobsArray.length} jobs to localStorage`);
    } catch (error) {
      console.error('Error saving jobs to localStorage:', error);
    }
  }
};

// Sync with database
const syncWithDatabase = async () => {
  if (typeof window !== 'undefined') {
    try {
      // Check if we're in a hardcoded user session
      const storedUserId = window.localStorage.getItem('hardcodedUserId');
      
      console.log(`Syncing jobs for all hardcoded users with database`);
      
      const prisma = prismaClientSingleton();
      
      // Get jobs from database for all hardcoded users instead of just current user
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
      
      console.log(`Found ${dbJobs.length} hardcoded user jobs in database`);
      
      // Update in-memory store with database jobs
      dbJobs.forEach((dbJob) => {
        // Safely cast to our expected type
        const job = dbJob as unknown as DbJobWithResults;
        
        if (jobsMap.has(job.id)) {
          // Update existing job
          const memoryJob = jobsMap.get(job.id);
          if (memoryJob) {
            memoryJob.status = job.status;
            memoryJob.updatedAt = job.updatedAt.toISOString();
            
            // Update results
            const formattedResults = job.results.map(result => ({
              website: result.website,
              email: result.email || null
            }));
            
            memoryJob.results = formattedResults;
            memoryJob.processedWebsites = formattedResults.length;
            
            jobsMap.set(job.id, memoryJob);
          }
        } else {
          // Add new job from database
          const newJob: HardcodedJob = {
            id: job.id,
            name: job.name || 'Unnamed Job',
            status: job.status,
            sheetUrl: job.sheetUrl,
            columnName: job.columnName,
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
            userId: job.userId,
            totalWebsites: job.totalUrls || 0,
            processedWebsites: job.results.length,
            results: job.results.map(r => ({
              website: r.website,
              email: r.email || null
            }))
          };
          
          jobsMap.set(job.id, newJob);
        }
      });
      
      // Save updated jobs to localStorage
      saveToStorage();
      
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error syncing with database:', error);
    }
  }
};

// Set user in localStorage
export const setCurrentUser = (userId: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('hardcodedUserId', userId);
    console.log(`Set current hardcoded user to ${userId} in localStorage`);
    
    // Sync with database when user changes
    syncWithDatabase();
  }
};

// Call on app initialization
export const initializeHardcodedJobs = () => {
  initializeFromStorage();
  syncWithDatabase();
};

// Export a more predictable typed API
export const hardcodedJobs = {
  set: (id: string, job: HardcodedJob) => {
    jobsMap.set(id, job);
    saveToStorage();
  },
  get: (id: string) => {
    return jobsMap.get(id);
  },
  has: (id: string) => {
    return jobsMap.has(id);
  },
  delete: (id: string) => {
    const deleted = jobsMap.delete(id);
    saveToStorage();
    return deleted;
  },
  clear: () => {
    jobsMap.clear();
    saveToStorage();
  },
  size: () => {
    // Handle case where jobsMap might be undefined on client side
    if (typeof jobsMap === 'undefined' || jobsMap === null) {
      return 0;
    }
    return jobsMap.size;
  },
  values: () => {
    // Ensure jobsMap exists before trying to access it
    if (typeof jobsMap === 'undefined' || jobsMap === null) {
      return [];
    }
    return Array.from(jobsMap.values());
  },
  getJobsForUser: (userId: string) => {
    // Ensure jobsMap exists before trying to access it
    if (typeof jobsMap === 'undefined' || jobsMap === null) {
      return [];
    }
    return Array.from(jobsMap.values()).filter(job => job.userId === userId);
  },
  generateJobId: () => uuidv4(),
};

// Function to get a job by ID
export async function getJobById(jobId: string) {
  // First check the in-memory store
  const memoryJob = hardcodedJobs.get(jobId);
  if (memoryJob) {
    return memoryJob;
  }
  
  // If not found in memory, try the database
  try {
    const prisma = prismaClientSingleton();
    const dbJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: { results: true }
    });
    
    if (!dbJob) {
      return null;
    }
    
    // Create a properly formatted job
    const formattedJob: HardcodedJob = {
      id: dbJob.id,
      name: dbJob.name || 'Unnamed Job',
      status: dbJob.status,
      sheetUrl: dbJob.sheetUrl,
      columnName: dbJob.columnName,
      totalWebsites: dbJob.totalUrls,
      processedWebsites: dbJob.results.length,
      results: dbJob.results.map(r => ({
        website: r.website,
        email: r.email || null
      })),
      createdAt: dbJob.createdAt.toISOString(),
      updatedAt: dbJob.updatedAt.toISOString(),
      userId: dbJob.userId
    };
    
    // Add to in-memory store for future
    hardcodedJobs.set(jobId, formattedJob);
    
    await prisma.$disconnect();
    return formattedJob;
  } catch (error) {
    console.error(`Error fetching job ${jobId} from database:`, error);
    return null;
  }
}

// Function to delete a job by ID
export async function deleteJob(jobId: string) {
  console.log(`Attempting to delete job: ${jobId}`);
  
  // Track success status for both operations
  let memoryDeleteSuccess = false;
  let dbDeleteSuccess = false;
  
  try {
    // First try to delete from in-memory store
    if (!hardcodedJobs.has(jobId)) {
      console.log(`Job ${jobId} not found in memory store`);
    } else {
      const job = hardcodedJobs.get(jobId);
      console.log(`Found job ${jobId} in memory, user: ${job?.userId}, status: ${job?.status}`);
      memoryDeleteSuccess = hardcodedJobs.delete(jobId);
      console.log(`Deleted job ${jobId} from memory: ${memoryDeleteSuccess ? 'success' : 'failed'}`);
    }
    
    // Then try to delete from database
    try {
      const prisma = prismaClientSingleton();
      
      // First check if the job exists
      const jobExists = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true } // Only fetch the ID to minimize data transfer
      });
      
      if (!jobExists) {
        console.log(`Job ${jobId} not found in database, nothing to delete`);
        // Job not in database is not an error - could be memory-only job
        dbDeleteSuccess = true;
      } else {
        // First delete associated results (due to foreign key constraints)
        try {
          console.log(`Deleting results for job ${jobId}...`);
          const deleteResultsResponse = await prisma.result.deleteMany({
            where: { jobId: jobId }
          });
          console.log(`Deleted ${deleteResultsResponse.count} results for job ${jobId}`);
        } catch (resultError) {
          console.error(`Error deleting results for job ${jobId}:`, resultError);
          // Continue trying to delete the job even if results deletion fails
        }
        
        // Then delete the job
        try {
          console.log(`Deleting job ${jobId} from database...`);
          await prisma.job.delete({
            where: { id: jobId }
          });
          console.log(`Successfully deleted job ${jobId} from database`);
          dbDeleteSuccess = true;
        } catch (jobError) {
          console.error(`Error deleting job ${jobId} from database:`, jobError);
          // Log error but don't throw
          dbDeleteSuccess = false;
        }
      }
      
      await prisma.$disconnect();
    } catch (dbError) {
      console.error(`Database error while deleting job ${jobId}:`, dbError);
      dbDeleteSuccess = false;
    }
  } catch (error) {
    console.error(`Critical error deleting job ${jobId}:`, error);
    // For complete safety, check memory store again and delete if still there
    if (hardcodedJobs.has(jobId)) {
      console.log(`Forcing memory deletion for job ${jobId} after error`);
      memoryDeleteSuccess = hardcodedJobs.delete(jobId);
    }
  }
  
  // Return true if at least one operation succeeded
  return memoryDeleteSuccess || dbDeleteSuccess;
}

// Debug function to print all in-memory jobs
export function logAllJobs() {
  console.log(`In-memory jobs map status - Size: ${hardcodedJobs.size()}`);
  hardcodedJobs.values().forEach((job) => {
    console.log(`Memory job: ${job.id} - User: ${job.userId} - Status: ${job.status} - Created: ${job.createdAt}`);
  });
}

// Separate function to clear only the in-memory store without affecting the database
// This should NOT be called during normal operations - only used for debugging
export function clearMemoryButNotDb() {
  console.log(`WARNING: Clearing in-memory job store while preserving database records`);
  jobsMap.clear();
  
  // Also clear localStorage if available
  if (typeof window !== 'undefined') {
    localStorage.removeItem('hardcodedJobs');
    console.log('Cleared hardcodedJobs from localStorage');
  }
  
  console.log(`In-memory store cleared. Will reload from database on next operation`);
  return true;
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
              email: result.email || null
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
  // Check if we're running client-side and need to initialize through storage first
  if (typeof window !== 'undefined') {
    initializeFromStorage();
  }
  
  if (hardcodedJobs.size() > 0) {
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
      console.log(`Loading job ${job.id} for user ${job.userId} with ${job.results.length} results`);
      
      // Create properly typed results with type assertion
      const typedResults = job.results.map(r => ({
        website: r.website,
        email: r.email as string | null // Use type assertion here
      }));
      
      hardcodedJobs.set(job.id, {
        id: job.id,
        name: job.name || 'Unnamed Job',
        status: job.status,
        sheetUrl: job.sheetUrl,
        columnName: job.columnName,
        totalWebsites: job.totalUrls,
        processedWebsites: job.results.length,
        progress: job.progress || 0,
        results: typedResults,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        userId: job.userId
      });
    }
    
    // Save all loaded jobs to localStorage for client-side persistence
    if (typeof window !== 'undefined') {
      saveToStorage();
    }
    
    await prisma.$disconnect();
    console.log(`Loaded ${hardcodedJobs.size()} jobs into memory store`);
    logAllJobs();  // Log all loaded jobs for debugging
  } catch (error) {
    console.error("Error loading jobs from database:", error);
  }
} 
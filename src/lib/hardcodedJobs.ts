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
      // Only run for hardcoded users
      const storedUserId = window.localStorage.getItem('hardcodedUserId');
      if (!storedUserId) {
        console.log('Not a hardcoded user, skipping database sync');
        return;
      }
      
      const userId = storedUserId;
      console.log(`Syncing jobs for hardcoded user ${userId} with database`);
      
      const prisma = prismaClientSingleton();
      
      // Get jobs from database
      const dbJobs = await prisma.job.findMany({
        where: { 
          userId: userId 
        },
        include: {
          results: true
        }
      });
      
      console.log(`Found ${dbJobs.length} jobs in database for user ${userId}`);
      
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
            name: job.name || 'Untitled Job',
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

export const hardcodedJobs = {
  set: (id: string, job: HardcodedJob) => {
    jobsMap.set(id, job);
    saveToStorage();
  },
  get: (id: string) => jobsMap.get(id),
  has: (id: string) => jobsMap.has(id),
  delete: (id: string) => {
    const result = jobsMap.delete(id);
    saveToStorage();
    return result;
  },
  clear: () => {
    jobsMap.clear();
    saveToStorage();
  },
  values: () => Array.from(jobsMap.values()),
  getJobsForUser: (userId: string) => {
    return Array.from(jobsMap.values()).filter(job => job.userId === userId);
  },
  generateJobId: () => uuidv4(),
  size: () => jobsMap.size
};

// Debug function to print all in-memory jobs
export function logAllJobs() {
  console.log(`In-memory jobs map status - Size: ${hardcodedJobs.size()}`);
  hardcodedJobs.values().forEach((job) => {
    console.log(`Memory job: ${job.id} - User: ${job.userId} - Status: ${job.status} - Created: ${job.createdAt}`);
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
          email: r.email || null
        })),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        userId: job.userId
      });
    }
    
    await prisma.$disconnect();
    console.log(`Loaded ${hardcodedJobs.size()} jobs into memory store`);
    logAllJobs();  // Log all loaded jobs for debugging
  } catch (error) {
    console.error("Error loading jobs from database:", error);
  }
} 
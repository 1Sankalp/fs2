// Create an in-memory job storage for hardcoded users
// This is shared across routes to maintain state between requests

// Note: This will be reset on server restarts as it's in-memory storage
// In production, you should use a database or persistent storage
export const hardcodedJobs = new Map<string, any>();

// Debug function to print all in-memory jobs
export function logAllJobs() {
  console.log(`In-memory jobs map status - Size: ${hardcodedJobs.size}`);
  hardcodedJobs.forEach((job, id) => {
    console.log(`Memory job: ${id} - User: ${job.userId} - Status: ${job.status} - Created: ${job.createdAt}`);
  });
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
// Create an in-memory job storage for hardcoded users
// This is shared across routes to maintain state between requests
export const hardcodedJobs = new Map<string, any>(); 
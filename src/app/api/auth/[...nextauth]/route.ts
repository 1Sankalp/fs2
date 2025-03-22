import NextAuth from "next-auth";
import { authOptions, ensureUsersExist } from "../../../../lib/auth";

// Initialize users asynchronously without blocking route handlers
// This prevents prepared statement conflicts between initialization and auth
let initPromise: Promise<void> | null = null;

// Function to initialize with retry logic
const initializeUsers = async () => {
  try {
    // Attempt to ensure users exist with a timeout
    await Promise.race([
      ensureUsersExist(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("User initialization timed out")), 5000)
      )
    ]);
    console.log("User initialization completed successfully");
  } catch (error) {
    console.error("User initialization failed, will continue without it:", error);
    // The auth flow will still work for existing users
  }
};

// Start initialization but don't wait for it
if (!initPromise) {
  initPromise = initializeUsers();
}

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
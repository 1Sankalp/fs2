import { AuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, prismaClientSingleton } from "./prisma";
import { compare, hash } from "bcrypt";
import { JWT } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";

// Define hardcoded users
const USERS = [
  { username: "lee", password: "funnelstrike@135" },
  { username: "sankalp", password: "funnelstrike@135" }
];

// Add the User interface
interface User {
  id: string;
  name: string;
  email: string;
}

// Function to initialize predefined users with retry logic
export async function ensureUsersExist() {
  // Use a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    for (const user of USERS) {
      try {
        const userId = `hardcoded-${user.username.toLowerCase()}`;
        
        // Check if user exists using the fresh client by ID (not email)
        const existingUser = await freshPrisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          const hashedPassword = await hash(user.password, 10);
          // Create user with hardcoded ID format
          await freshPrisma.user.create({
            data: {
              id: userId, // Use hardcoded ID format
              name: user.username,
              email: `${user.username}@example.com`, // Email is required by schema but we don't use it
              password: hashedPassword,
            },
          });
          console.log(`Created hardcoded user: ${userId}`);
        } else {
          console.log(`Hardcoded user ${userId} already exists`);
        }
      } catch (userError) {
        // Log but continue with next user if one fails
        console.error(`Error processing user ${user.username}:`, userError);
      }
    }
  } catch (error) {
    console.error("Error initializing users:", error);
  } finally {
    // Clean up the fresh client
    await freshPrisma.$disconnect();
  }
}

// Create a direct connection Prisma client for the adapter
// This prevents prepared statement conflicts in the auth system
const createAdapterClient = () => {
  // Use NON_POOLING URL if available for direct connection
  const directUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  
  return new PrismaClient({
    datasourceUrl: directUrl + "?statement_cache_size=0&connect_timeout=15",
  });
};

// Custom wrapper for adapter to avoid prepared statement issues
const createPrismaAdapter = () => {
  // Create a dedicated client just for the adapter
  const adapterClient = createAdapterClient();
  const adapter = PrismaAdapter(adapterClient);
  
  // Return the adapter with the client attached so we can disconnect it later
  return { adapter, client: adapterClient };
};

// Create the adapter with its dedicated client only in development mode
// In production, we'll use JWT-only mode without an adapter
const adapterSetup = process.env.NODE_ENV !== 'production' 
  ? createPrismaAdapter()
  : { adapter: undefined, client: undefined };

// Make sure to disconnect the adapter client when the process exits
if (typeof window === 'undefined' && adapterSetup.client) {
  process.on('beforeExit', () => {
    adapterSetup.client?.$disconnect();
  });
}

// Add this function to ensure consistent user ID format
export function getHardcodedUserId(username: string): string {
  return `hardcoded-${username.toLowerCase()}`;
}

// Update hardcoded users authentication to store userId in localStorage
async function authenticateUser(username: string, password: string): Promise<User | null> {
  // For demo purposes only - replace with your own authentication logic
  const hardcodedCredentials = [
    { username: 'sankalp', password: 'funnelstrike@135', name: 'Sankalp Demo' },
    { username: 'lee', password: 'funnelstrike@135', name: 'Lee Demo' },
  ];
  
  const matchedUser = hardcodedCredentials.find(
    cred => cred.username === username && cred.password === password
  );
  
  if (matchedUser) {
    // Hardcoded user ID format to ensure consistency
    const userId = `hardcoded-${matchedUser.username}`;
    
    // Store in localStorage for persistence between page refreshes
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hardcodedUserId', userId);
      console.log(`Stored hardcoded user ID in localStorage: ${userId}`);
      
      // Import and call setCurrentUser and load jobs if possible
      try {
        const { setCurrentUser, loadJobsFromDatabase } = await import('./hardcodedJobs');
        setCurrentUser(userId);
        
        // Also load jobs from database to ensure we have all jobs
        await loadJobsFromDatabase();
      } catch (error) {
        console.error('Error setting current user:', error);
      }
    }
    
    return {
      id: userId,
      name: matchedUser.name,
      email: `${matchedUser.username}@example.com`,
    };
  }
  
  return null;
}

export const authOptions: AuthOptions = {
  // Only use the adapter in development mode
  ...(adapterSetup.adapter ? { adapter: adapterSetup.adapter } : {}),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Get email from username or use the email directly
          const email = credentials.email.includes('@')
            ? credentials.email
            : `${credentials.email}@example.com`;
            
          // Try authenticating with hardcoded values first
          const user = await authenticateUser(credentials.email, credentials.password);
          
          if (user) {
            return user;
          }
          
          // For non-hardcoded users, fallback to database lookup (which likely won't be used)
          return null;
        } catch (error) {
          console.error("Authentication error:", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
  },
}; 
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

// Function to initialize predefined users with retry logic
export async function ensureUsersExist() {
  // Use a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    for (const user of USERS) {
      try {
        // Check if user exists using the fresh client
        const existingUser = await freshPrisma.user.findUnique({
          where: { email: `${user.username}@example.com` },
        });

        if (!existingUser) {
          const hashedPassword = await hash(user.password, 10);
          await freshPrisma.user.create({
            data: {
              name: user.username,
              email: `${user.username}@example.com`,
              password: hashedPassword,
            },
          });
          console.log(`Created user: ${user.username}`);
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

// Create the adapter with its dedicated client
const { adapter, client: adapterClient } = createPrismaAdapter();

// Make sure to disconnect the adapter client when the process exits
if (typeof window === 'undefined') {
  process.on('beforeExit', () => {
    adapterClient.$disconnect();
  });
}

export const authOptions: AuthOptions = {
  adapter: adapter,
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
          // Create a new Prisma client for each auth request to avoid statement conflicts
          const authPrisma = prismaClientSingleton();
          
          try {
            // Get email from username or use the email directly
            const email = credentials.email.includes('@')
              ? credentials.email
              : `${credentials.email}@example.com`;

            const user = await authPrisma.user.findUnique({
              where: { email },
            });

            if (!user || !user.password) {
              return null;
            }

            const isPasswordValid = await compare(credentials.password, user.password);

            if (!isPasswordValid) {
              return null;
            }

            return {
              id: user.id,
              email: user.email,
              name: user.name,
            };
          } catch (error) {
            console.error("Authorization error:", error);
            return null;
          } finally {
            // Important: Clean up the client to avoid connection issues
            await authPrisma.$disconnect();
          }
        } catch (outerError) {
          console.error("Failed to create Prisma client:", outerError);
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
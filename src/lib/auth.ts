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

// Custom wrapper for adapter to avoid prepared statement issues
const createPrismaAdapter = (p: PrismaClient) => {
  const adapter = PrismaAdapter(p);
  return adapter;
};

export const authOptions: AuthOptions = {
  adapter: createPrismaAdapter(prisma),
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

          const user = await prisma.user.findUnique({
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
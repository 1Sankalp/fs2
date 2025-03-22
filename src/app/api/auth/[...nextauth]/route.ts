import NextAuth, { AuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../../../../lib/prisma";
import { compare, hash } from "bcrypt";
import { JWT } from "next-auth/jwt";

// Define hardcoded users
const USERS = [
  { username: "lee", password: "funnelstrike@135" },
  { username: "sankalp", password: "funnelstrike@135" }
];

// Function to initialize predefined users
async function ensureUsersExist() {
  try {
    for (const user of USERS) {
      const existingUser = await prisma.user.findUnique({
        where: { email: `${user.username}@example.com` },
      });

      if (!existingUser) {
        const hashedPassword = await hash(user.password, 10);
        await prisma.user.create({
          data: {
            name: user.username,
            email: `${user.username}@example.com`,
            password: hashedPassword,
          },
        });
        console.log(`Created user: ${user.username}`);
      }
    }
  } catch (error) {
    console.error("Error initializing users:", error);
  }
}

// Initialize users when this file is first loaded
ensureUsersExist();

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
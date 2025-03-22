import NextAuth from "next-auth";
import { authOptions, ensureUsersExist } from "../../../../lib/auth";

// Initialize users when this file is first loaded
ensureUsersExist();

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 
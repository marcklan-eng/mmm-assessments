import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: "select_account" } },
    }),
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      // "common" accepts personal Microsoft accounts (Outlook, Hotmail, Live) and work/school accounts.
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
      authorization: { params: { scope: "openid profile email User.Read", prompt: "select_account" } },
      // Use the verified sign-in email; some work accounts only send preferred_username.
      // Also skips the profile-photo download, which bloats the session cookie.
      profile(p) {
        return { id: p.sub, name: p.name, email: (p.email ?? p.preferred_username ?? "").toLowerCase(), image: null };
      },
    }),
  );
}

if (DEMO_MODE) {
  // PROTOTYPE ONLY: lets testers sign in with any email, without verification.
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo email",
      credentials: { email: { label: "Email", type: "email" }, name: { label: "Name", type: "text" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
        return { id: email, email, name: String(creds?.name ?? "").trim() || email.split("@")[0] };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user }) {
      return Boolean(user.email);
    },
    async jwt({ token, account }) {
      if (account) token.provider = account.provider;
      if (token.email) token.email = token.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        (session.user as { provider?: string }).provider = token.provider as string;
      }
      return session;
    },
  },
};

export type SessionUser = { email: string; name: string; provider: string };

export async function currentUser(): Promise<SessionUser | null> {
  const s = await getServerSession(authOptions);
  const email = s?.user?.email?.toLowerCase();
  if (!email) return null;
  return {
    email,
    name: s?.user?.name ?? "",
    provider: (s?.user as { provider?: string })?.provider ?? "unknown",
  };
}

export const enabledProviders = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  microsoft: Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET),
  demo: DEMO_MODE,
};

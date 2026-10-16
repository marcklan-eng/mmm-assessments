import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

const providers: NextAuthOptions["providers"] = [];

// Trim pasted values: a stray space or line break makes Google reject the client ("invalid_client").
const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");
const GOOGLE_ID = clean(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_SECRET = clean(process.env.GOOGLE_CLIENT_SECRET);

if (GOOGLE_ID && GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
      authorization: { params: { prompt: "select_account" } },
    }),
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: clean(process.env.AZURE_AD_CLIENT_ID),
      clientSecret: clean(process.env.AZURE_AD_CLIENT_SECRET),
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
  // Keep the last sign-in error (no secrets) so /api/health can show what went wrong.
  logger: {
    error(code, metadata) {
      console.error("[auth]", code, metadata);
      const m = metadata as { error?: { message?: string }; message?: string } | undefined;
      const detail = String(m?.error?.message ?? m?.message ?? "").slice(0, 300);
      db.setJSON("auth:lastError", { code, detail, at: new Date().toISOString() }).catch(() => {});
    },
    warn(code) {
      console.warn("[auth]", code);
    },
    debug() {},
  },
  secret: process.env.NEXTAUTH_SECRET,
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
  let s;
  try {
    s = await getServerSession(authOptions);
  } catch (e) {
    if (process.env.NEXTAUTH_SECRET) throw e; // let Next.js handle its own internal errors
    // A missing NEXTAUTH_SECRET. Treat as signed out instead of crashing the page;
    // /api/health shows which setting is missing.
    console.error("Could not read session", e);
    return null;
  }
  const email = s?.user?.email?.toLowerCase();
  if (!email) return null;
  return {
    email,
    name: s?.user?.name ?? "",
    provider: (s?.user as { provider?: string })?.provider ?? "unknown",
  };
}

export const enabledProviders = {
  google: Boolean(GOOGLE_ID && GOOGLE_SECRET),
  microsoft: Boolean(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET),
  demo: DEMO_MODE,
};

/** For the setup check: shows enough of the Google Client ID to spot paste mistakes (it isn't secret). */
export function googleClientCheck() {
  const raw = process.env.GOOGLE_CLIENT_ID ?? "";
  if (!raw) return "MISSING";
  const id = GOOGLE_ID;
  const notes = [];
  if (raw !== id) notes.push("had extra spaces/quotes (now trimmed)");
  if (!id.endsWith(".apps.googleusercontent.com")) notes.push("should end with .apps.googleusercontent.com");
  if (id.startsWith("GOCSPX")) notes.push("this looks like the Client SECRET, not the Client ID");
  if (!GOOGLE_SECRET) notes.push("GOOGLE_CLIENT_SECRET missing");
  else notes.push(`secret ${GOOGLE_SECRET.length} chars`);
  else if (!GOOGLE_SECRET.startsWith("GOCSPX-")) notes.push("GOOGLE_CLIENT_SECRET usually starts with GOCSPX-");
  return `${id.slice(0, 16)}…${id.slice(-30)} (${id.length} chars)${notes.length ? " — " + notes.join("; ") : ""}`;
}

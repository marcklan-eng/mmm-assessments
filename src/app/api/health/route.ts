import { NextResponse } from "next/server";
import { db, usingRedis } from "@/lib/db";
import { DEMO_MODE, enabledProviders } from "@/lib/auth";
import { sheetConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

// Setup check: shows which settings are present (never their values, except the public URL).
export async function GET() {
  let storage = usingRedis ? "redis" : process.env.VERCEL ? "MISSING (connect Upstash Redis)" : "local file";
  if (usingRedis) {
    try {
      await db.getLatestId("health-check", "health@check");
      storage = "redis: connected";
    } catch (e) {
      storage = `redis: ERROR ${(e as Error).message.slice(0, 120)}`;
    }
  }
  return NextResponse.json({
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "MISSING",
    DEMO_MODE,
    storage,
    projectVarNames: Object.keys(process.env).filter((k) => /AUTH|DEMO|GOOGLE|AZURE|ADMIN|KV_|REDIS/i.test(k)).sort(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    otherRedisVars: Object.keys(process.env).filter((k) => /REDIS|KV_/.test(k)),
    googleSignIn: enabledProviders.google,
    microsoftSignIn: enabledProviders.microsoft,
    googleSheet: sheetConfigured,
  });
}

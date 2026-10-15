import { NextResponse } from "next/server";
import { db, usingRedis } from "@/lib/db";
import { DEMO_MODE, enabledProviders, googleClientCheck } from "@/lib/auth";
import { pingSheet, sheetConfigured } from "@/lib/google";

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
  let googleSheet = sheetConfigured ? "configured" : "not configured";
  if (sheetConfigured) {
    try {
      googleSheet = `connected: ${await pingSheet()}`;
    } catch (e) {
      googleSheet = `ERROR ${(e as Error).message.slice(0, 160)}`;
    }
  }
  return NextResponse.json({
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "MISSING",
    DEMO_MODE,
    storage,
    projectVarNames: ["NEXTAUTH_SECRET","NEXTAUTH_URL","DEMO_MODE","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","AZURE_AD_CLIENT_ID","AZURE_AD_CLIENT_SECRET","AZURE_AD_TENANT_ID","SHEET_WEBHOOK_URL","SHEET_WEBHOOK_SECRET","ADMIN_EMAILS"].filter((k) => process.env[k]),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    otherRedisVars: Object.keys(process.env).filter((k) => /REDIS|KV_/.test(k)),
    googleSignIn: enabledProviders.google,
    googleClientId: googleClientCheck(),
    microsoftSignIn: enabledProviders.microsoft,
    googleSheet,
  });
}

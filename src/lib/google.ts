// Google Sheet results + evaluator access, via an Apps Script web app inside the results Sheet.
// The script (apps-script/Code.gs) appends rows and reports who the Sheet is shared with.
import type { Attempt } from "./types";
import { getMeta } from "@/content/assessments";
import { getContent, allQuestions } from "@/content";

const WEBHOOK_URL = process.env.SHEET_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.SHEET_WEBHOOK_SECRET;

export const sheetConfigured = Boolean(WEBHOOK_URL && WEBHOOK_SECRET);

async function callScript<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) throw new Error("Google Sheet is not configured");
  // Apps Script answers POSTs with a redirect to the result; fetch follows it.
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: WEBHOOK_SECRET, action, ...payload }),
    redirect: "follow",
    cache: "no-store",
  });
  const text = await res.text();
  let json: { ok?: boolean; error?: string } & T;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sheet script returned an unexpected response (HTTP ${res.status}). Check the web app deployment and access setting.`);
  }
  if (!json.ok) throw new Error(`Sheet script error: ${json.error ?? "unknown"}`);
  return json;
}

export async function pingSheet(): Promise<string> {
  const r = await callScript<{ sheetName: string }>("ping");
  return r.sheetName;
}

// ---------- Evaluator access ----------

let shareCache: { at: number; emails: Set<string> } | null = null;

/** Everyone the Sheet is shared with by email (cached for 5 minutes). */
export async function sheetSharedEmails(): Promise<Set<string>> {
  if (shareCache && Date.now() - shareCache.at < 5 * 60_000) return shareCache.emails;
  const r = await callScript<{ emails: string[] }>("sharedEmails");
  const emails = new Set(r.emails.map((e) => e.toLowerCase()));
  shareCache = { at: Date.now(), emails };
  return emails;
}

// ---------- Results rows ----------

const BASE_HEADERS = [
  "Submitted At",
  "Name",
  "Email",
  "Sign-in",
  "Started At",
  "Time Used",
  "Completion",
  "Score",
  "Total",
  "Percent",
  "Result",
  "Left Window",
  "Exited Fullscreen",
  "Copy/Paste Attempts",
  "Screenshot Key",
  "Retake After",
  "Attempt ID",
];

function fmtDate(ms?: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function attemptRow(a: Attempt): { headers: string[]; values: (string | number)[] } {
  const content = getContent(a.slug);
  const qs = content ? allQuestions(content) : [];
  const count = (t: string) => a.activity.filter((e) => e.type === t).length;
  const values: (string | number)[] = [
    fmtDate(a.submittedAt),
    a.name,
    a.email,
    a.provider,
    fmtDate(a.startedAt),
    a.submittedAt ? fmtDuration(Math.min(a.submittedAt, a.deadline) - a.startedAt) : "",
    a.status === "timed_out" ? "Timed out" : a.status === "submitted" ? "Submitted" : "In progress",
    a.score ?? "",
    a.total ?? "",
    a.percent != null ? `${a.percent}%` : "",
    a.passed == null ? "" : a.passed ? "PASS" : "FAIL",
    count("tab_switch"),
    count("fullscreen_exit"),
    count("copy_attempt"),
    count("screenshot_key"),
    a.retakeAfter ? new Date(a.retakeAfter).toLocaleDateString("en-US") : "",
    a.id,
  ];
  const headers = [...BASE_HEADERS];
  qs.forEach((q, i) => {
    headers.push(`Q${i + 1}`);
    const chosen = a.answers[q.id];
    const text = q.options.find((o) => o.id === chosen)?.text;
    values.push(!chosen ? "— (blank)" : `${chosen === q.answer ? "✓" : "✗"} ${text}`);
  });
  return { headers, values };
}

/** Appends a finished attempt to the assessment's tab (the script creates the tab + header row if needed). */
export async function appendToSheet(a: Attempt): Promise<void> {
  const { headers, values } = attemptRow(a);
  await callScript("append", { tab: getMeta(a.slug)?.title ?? a.slug, headers, values, attemptId: a.id });
}

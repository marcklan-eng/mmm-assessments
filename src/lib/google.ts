// Google Sheet results + evaluator access, via an Apps Script web app inside the results Sheet.
// The script (apps-script/Code.gs) appends rows and reports who the Sheet is shared with.
import type { Attempt } from "./types";
import { getMeta } from "@/content/assessments";
import { getContent, allQuestions, type QuestionSet } from "@/content";

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

let versionCache: { at: number; v: number } | null = null;

export async function pingSheet(): Promise<string> {
  const r = await callScript<{ sheetName: string; scriptVersion?: number }>("ping");
  versionCache = { at: Date.now(), v: r.scriptVersion ?? 1 };
  return r.sheetName;
}

/** Which version of apps-script/Code.gs is deployed (1 = before the question bank). */
async function scriptVersion(): Promise<number> {
  if (!versionCache || Date.now() - versionCache.at > 5 * 60_000) await pingSheet();
  return versionCache!.v;
}

// ---------- Evaluator access ----------

let shareCache: { at: number; emails: Set<string>; editors: Set<string> } | null = null;

async function sharing() {
  if (shareCache && Date.now() - shareCache.at < 5 * 60_000) return shareCache;
  const r = await callScript<{ emails: string[]; editors?: string[] }>("sharedEmails");
  const lower = (xs: string[]) => new Set(xs.map((e) => e.toLowerCase()));
  const result = { at: Date.now(), emails: lower(r.emails), editors: lower(r.editors ?? []) };
  // Older scripts don't report editors; don't cache that, so the update is picked up right away.
  shareCache = r.editors ? result : null;
  return result;
}

/** Everyone the Sheet is shared with by email (cached for 5 minutes). */
export async function sheetSharedEmails(): Promise<Set<string>> {
  return (await sharing()).emails;
}

/** People who can edit the Sheet (they can also publish questions). */
export async function sheetEditorEmails(): Promise<Set<string>> {
  return (await sharing()).editors;
}

// ---------- Questions tab ----------

/** Rows of the "Questions" tab as displayed text (null if the tab doesn't exist). */
export async function readQuestionRows(): Promise<string[][] | null> {
  let r: { rows: string[][] | null; url?: string };
  try {
    r = await callScript<{ rows: string[][] | null; url?: string }>("readQuestions");
  } catch (e) {
    if (/unknown action/.test((e as Error).message)) {
      throw new Error("The results Sheet is running an older version of the Apps Script. Paste in the latest Code.gs and deploy a new version.");
    }
    throw e;
  }
  if (r.url) sheetUrl = r.url;
  return r.rows;
}

/** Link to the results Sheet (learned from the script). */
export let sheetUrl: string | null = null;

/** Creates the Questions tab with these rows. Refuses if it already has content. */
export async function seedQuestionRows(rows: string[][]): Promise<{ created: boolean; reason?: string }> {
  return callScript<{ created: boolean; reason?: string }>("seedQuestions", { rows });
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
  "Question Set",
];

function fmtDate(ms?: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export async function attemptRow(a: Attempt, preloaded?: QuestionSet): Promise<{ headers: string[]; values: (string | number)[] }> {
  const content = preloaded ?? (await getContent(a.slug, a.version ?? 0));
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
    `v${a.version ?? 0}`,
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
  let { headers, values } = await attemptRow(a);
  if ((await scriptVersion()) < 2) {
    // The Sheet still runs the older script, which doesn't know the Question Set column.
    const i = headers.indexOf("Question Set");
    headers = headers.filter((_, k) => k !== i);
    values = values.filter((_, k) => k !== i);
  }
  const tab = getMeta(a.slug)?.title ?? a.slug;
  await callScript("append", {
    tab,
    headers,
    values,
    attemptId: a.id,
    // One row per candidate on the first (summary) tab: their latest score per assessment.
    summary: { name: a.name, email: a.email, assessment: tab, score: a.score ?? 0 },
  });
}

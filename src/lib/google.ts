// Google Sheets via Apps Script web apps (apps-script/Code.gs, the same script in both Sheets):
// - the results Sheet: result rows, the summary tab, and dashboard access (who it's shared with)
// - the questions Sheet: the Questions tab (question bank) and who may edit/publish questions
import type { Attempt } from "./types";
import { getMeta } from "@/content/assessments";
import { getContent, allQuestions, type QuestionSet } from "@/content";
import { answerText, isCorrect, isPerRow } from "@/content/answers";

type Target = { url?: string; secret?: string; label: string };

// The results Sheet (results rows, summary, dashboard access).
const RESULTS: Target = { url: process.env.SHEET_WEBHOOK_URL, secret: process.env.SHEET_WEBHOOK_SECRET, label: "results Sheet" };
// The question bank Sheet. Optional: without it, the Questions tab lives in the results Sheet.
const QUESTIONS_SEPARATE = Boolean(process.env.QUESTIONS_WEBHOOK_URL);
const QUESTIONS: Target = QUESTIONS_SEPARATE
  ? {
      url: process.env.QUESTIONS_WEBHOOK_URL,
      secret: process.env.QUESTIONS_WEBHOOK_SECRET || process.env.SHEET_WEBHOOK_SECRET,
      label: "questions Sheet",
    }
  : RESULTS;

export const sheetConfigured = Boolean(RESULTS.url && RESULTS.secret);
export const questionsConfigured = Boolean(QUESTIONS.url && QUESTIONS.secret);
export const questionsSeparate = QUESTIONS_SEPARATE;

async function callTarget<T>(t: Target, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!t.url || !t.secret) throw new Error(`The ${t.label} is not connected yet.`);
  // Apps Script answers POSTs with a redirect to the result; fetch follows it.
  const res = await fetch(t.url.trim(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: t.secret.trim(), action, ...payload }),
    redirect: "follow",
    cache: "no-store",
  });
  const text = await res.text();
  let json: { ok?: boolean; error?: string } & T;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`The ${t.label} script returned an unexpected response (HTTP ${res.status}). Check its web app deployment and access setting.`);
  }
  if (!json.ok) {
    if (json.error === "unknown action") {
      throw new Error(`The ${t.label} is running an older version of the Apps Script. Paste in the latest Code.gs and deploy a new version.`);
    }
    if (json.error === "unauthorized") throw new Error(`The password for the ${t.label} script doesn't match the one in Vercel.`);
    throw new Error(`${t.label} script error: ${json.error ?? "unknown"}`);
  }
  return json;
}
const callScript = <T,>(action: string, payload: Record<string, unknown> = {}) => callTarget<T>(RESULTS, action, payload);

let versionCache: { at: number; v: number } | null = null;

export async function pingSheet(): Promise<string> {
  const r = await callScript<{ sheetName: string; scriptVersion?: number }>("ping");
  versionCache = { at: Date.now(), v: r.scriptVersion ?? 1 };
  return r.sheetName;
}

export async function pingQuestionsSheet(): Promise<string> {
  const r = await callTarget<{ sheetName: string }>(QUESTIONS, "ping");
  return r.sheetName;
}

/** Which version of apps-script/Code.gs is deployed (1 = before the question bank). */
async function scriptVersion(): Promise<number> {
  if (!versionCache || Date.now() - versionCache.at > 5 * 60_000) await pingSheet();
  return versionCache!.v;
}

// ---------- Access (who a Sheet is shared with) ----------

type Sharing = { at: number; emails: Set<string>; editors: Set<string> };
const shareCache = new Map<Target, Sharing>();

async function sharing(t: Target): Promise<Sharing> {
  const hit = shareCache.get(t);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const r = await callTarget<{ emails: string[]; editors?: string[] }>(t, "sharedEmails");
  const lower = (xs: string[]) => new Set(xs.map((e) => e.toLowerCase()));
  const result = { at: Date.now(), emails: lower(r.emails), editors: lower(r.editors ?? []) };
  // Older scripts don't report editors; don't cache that, so the update is picked up right away.
  if (r.editors) shareCache.set(t, result);
  return result;
}

/** Everyone the results Sheet is shared with by email (dashboard access; cached for 5 minutes). */
export async function sheetSharedEmails(): Promise<Set<string>> {
  return (await sharing(RESULTS)).emails;
}

/** Everyone the questions Sheet is shared with (can check and preview questions). */
export async function questionsSharedEmails(): Promise<Set<string>> {
  return (await sharing(QUESTIONS)).emails;
}

/** Editors of the questions Sheet (can publish questions and upload media). */
export async function questionsEditorEmails(): Promise<Set<string>> {
  return (await sharing(QUESTIONS)).editors;
}

// ---------- Questions tab ----------

/** Link to the questions Sheet (learned from the script). */
export let sheetUrl: string | null = null;

export type QuestionTab = { name: string; rows: string[][] };

/** Every tab of the questions Sheet as displayed text (one tab per assessment, and/or a "Questions" tab). */
export async function readQuestionTabs(): Promise<QuestionTab[]> {
  const r = await callTarget<{ tabs?: QuestionTab[]; rows?: string[][] | null; url?: string }>(QUESTIONS, "readQuestions");
  if (r.url) sheetUrl = r.url;
  if (r.tabs) return r.tabs;
  return r.rows ? [{ name: "Questions", rows: r.rows }] : []; // older script: only the Questions tab
}

/** Fills empty assessment tabs (creating them if needed). Tabs that already have content are left alone. */
export async function seedQuestionTabs(tabs: QuestionTab[]): Promise<{ created: string[]; skipped: string[] }> {
  return callTarget<{ created: string[]; skipped: string[] }>(QUESTIONS, "seedQuestions", { tabs });
}

export type QuestionEditOp =
  | { op: "update"; row: number; before: Record<string, string>; values: Record<string, string> }
  | { op: "insert"; after: number; values: Record<string, string> }
  | { op: "delete"; row: number; before: Record<string, string> };

/** Saves an edit made in the app to a question tab. Throws a clear message if the row changed in the Sheet meanwhile. */
export async function editQuestionTab(tab: string, ops: QuestionEditOp[]): Promise<{ insertedAt: number | null }> {
  try {
    return await callTarget<{ insertedAt: number | null }>(QUESTIONS, "editQuestions", { tab, ops });
  } catch (e) {
    if (/conflict/.test((e as Error).message)) {
      throw new Error("This question was changed in the Sheet since you opened it. Close the editor, open it again and redo your change.");
    }
    throw e;
  }
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
  let n = 0;
  for (const q of qs) {
    const chosen = a.answers[q.id];
    if (isPerRow(q) && q.rows) {
      // A grid scored per row: one numbered column per row, e.g. "Q6 Voicemail1".
      const got = (chosen ?? "").split(","), want = q.answer.split(",");
      q.rows.forEach((r, ri) => {
        headers.push(`Q${++n}`);
        const pick = got[ri];
        const text = q.options.find((o) => o.id === pick)?.text ?? "";
        values.push(!pick ? `— (blank) ${r.text}` : `${pick === want[ri] ? "✓" : "✗"} ${r.text} → ${text}`);
      });
      continue;
    }
    headers.push(`Q${++n}`);
    values.push(!chosen ? "— (blank)" : `${isCorrect(q, chosen) ? "✓" : "✗"} ${answerText(q, chosen)}`);
  }
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

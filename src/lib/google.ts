// Google Sheet results + evaluator access (via the Sheet's sharing list).
import { google } from "googleapis";
import type { Attempt } from "./types";
import { getMeta } from "@/content/assessments";
import { getContent, allQuestions } from "@/content";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

export const sheetConfigured = Boolean(SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

function auth() {
  const creds = credentials();
  if (!creds || !SHEET_ID) return null;
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
  });
}

// ---------- Evaluator access ----------

let shareCache: { at: number; emails: Set<string> } | null = null;

/** Everyone the Sheet is shared with by email (cached for 5 minutes). */
export async function sheetSharedEmails(): Promise<Set<string>> {
  if (shareCache && Date.now() - shareCache.at < 5 * 60_000) return shareCache.emails;
  const a = auth();
  if (!a || !SHEET_ID) return new Set();
  const drive = google.drive({ version: "v3", auth: a });
  const emails = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await drive.permissions.list({
      fileId: SHEET_ID,
      fields: "nextPageToken, permissions(emailAddress, type, role)",
      supportsAllDrives: true,
      pageToken,
    });
    for (const p of res.data.permissions ?? []) {
      if (p.emailAddress && (p.type === "user" || p.type === "group")) emails.add(p.emailAddress.toLowerCase());
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
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

/** Appends a finished attempt to the assessment's tab (creating the tab + header row if needed). */
export async function appendToSheet(a: Attempt): Promise<void> {
  const ga = auth();
  if (!ga || !SHEET_ID) throw new Error("Google Sheet is not configured");
  const sheets = google.sheets({ version: "v4", auth: ga });
  const tab = getMeta(a.slug)?.title ?? a.slug;
  const { headers, values } = attemptRow(a);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties.title" });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A1`,
    valueInputOption: "RAW", // RAW so names/answers are never interpreted as formulas
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

// Answer helpers shared by the server and the browser (no answer keys in here).
import type { Option } from "./types";

type Q = { options: Option[]; rows?: Option[] | null };

/** True when every part of the question has an answer. */
export function isAnswered(q: Q, value: string | undefined): boolean {
  if (!value) return false;
  if (isTextQuestion(q)) return Boolean(value.trim());
  if (!q.rows?.length) return true;
  const parts = value.split(",");
  return q.rows.every((_, i) => Boolean(parts[i]));
}

/** A short-answer question: no choices, the candidate types the answer. */
export function isTextQuestion(q: Q): boolean {
  return q.options.length === 0;
}

/** Readable form of an answer, e.g. "Under-coding" or "Row A → Under-coding; Row B → Bundling". */
export function answerText(q: Q, value: string | undefined): string {
  if (!value) return "";
  if (isTextQuestion(q)) return value.split("\n").map((x) => x.trim()).filter(Boolean).join(" or ");
  if (!q.rows?.length) return q.options.find((o) => o.id === value)?.text ?? "";
  const parts = value.split(",");
  return q.rows
    .map((r, i) => `${short(r.text)} → ${q.options.find((o) => o.id === parts[i])?.text ?? "—"}`)
    .join("; ");
}

function short(t: string) {
  return t.length > 40 ? t.slice(0, 38).trimEnd() + "…" : t;
}

/** Set one row of a grid answer. */
export function setGridRow(value: string | undefined, rowCount: number, row: number, optionId: string): string {
  const parts = (value ?? "").split(",");
  const out = Array.from({ length: rowCount }, (_, i) => parts[i] ?? "");
  out[row] = optionId;
  return out.join(",");
}

// ---------- scoring (server side; the answer key never reaches the browser) ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "06/18/1987", "6-18-87", "June 18, 1987", "18 June 1987", "1987-06-18" → "1987-06-18". */
export function normalizeDate(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  const year = (y: string) => (y.length === 2 ? (Number(y) > 30 ? "19" : "20") + y : y);
  const out = (y: string, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${year(y)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return out(m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/); // US order: month/day/year
  if (m) return out(m[3], +m[1], +m[2]);
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/);
  if (m && MONTHS.indexOf(m[1].slice(0, 3)) >= 0) return out(m[3], MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]);
  m = t.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{2}|\d{4})$/);
  if (m && MONTHS.indexOf(m[2].slice(0, 3)) >= 0) return out(m[3], MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]);
  return null;
}

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Whether a typed answer matches one of the accepted answers (case, spacing, punctuation and date format don't matter). */
export function textMatches(accepted: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return accepted
    .split("\n")
    .map((a) => a.trim())
    .filter(Boolean)
    .some((a) => {
      const da = normalizeDate(a);
      if (da) return normalizeDate(v) === da;
      return plain(a) === plain(v);
    });
}

export function isCorrect(q: Q & { answer: string }, value: string | undefined): boolean {
  if (!value) return false;
  if (isTextQuestion(q)) return textMatches(q.answer, value);
  return value === q.answer;
}

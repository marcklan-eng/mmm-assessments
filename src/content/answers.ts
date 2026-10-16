// Answer helpers shared by the server and the browser (no answer keys in here).
import type { Option } from "./types";

type Q = { options: Option[]; rows?: Option[] | null };

/** True when every part of the question has an answer. */
export function isAnswered(q: Q, value: string | undefined): boolean {
  if (!value) return false;
  if (!q.rows?.length) return true;
  const parts = value.split(",");
  return q.rows.every((_, i) => Boolean(parts[i]));
}

/** Readable form of an answer, e.g. "Under-coding" or "Row A → Under-coding; Row B → Bundling". */
export function answerText(q: Q, value: string | undefined): string {
  if (!value) return "";
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

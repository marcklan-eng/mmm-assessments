// Invite-link expiry: each candidate has 48 hours (LINK_EXPIRY_HOURS) per assessment to complete it.
// Everyone gets the same link, so the window starts at the earliest of:
//   - the time the invite email was sent, if the link carries it (?sent=… from a Salesforce merge field), and
//   - the first time the candidate opens the link while signed in.
// The earliest time ever seen is kept, so editing the link can't extend the window.
// An evaluator can give a candidate a fresh window from the dashboard ("Reopen a link").
import { db } from "./db";

export const WINDOW_HOURS = Number(process.env.LINK_EXPIRY_HOURS ?? 48);
const WINDOW_MS = WINDOW_HOURS * 3600_000;
const NEW_INVITE_AFTER_MS = 180 * 86400_000; // a window older than 6 months belongs to an earlier application

export type AccessRecord = { start: number; source: "email" | "first-visit" | "reopened"; reopenedBy?: string };
const key = (slug: string, email: string) => `access:${slug}:${email.toLowerCase()}`;

/** Reads "sent" from the invite link: 2026-10-10, 2026-10-10T20:47:00Z, 10/10/2026, "10/10/2026 8:47 PM", or epoch ms. */
export function parseSent(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  let t: number;
  if (/^\d{12,13}$/.test(s)) t = Number(s);
  else {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/);
    if (m) {
      let h = Number(m[4] ?? 0);
      if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0);
      t = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5] ?? 0)).getTime();
    } else t = Date.parse(s);
  }
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  if (t > now + 3600_000 || now - t > NEW_INVITE_AFTER_MS) return null; // future or too old: ignore
  return t;
}

async function current(slug: string, email: string): Promise<AccessRecord | null> {
  const r = await db.getJSON<AccessRecord>(key(slug, email));
  if (!r || Date.now() - r.start > NEW_INVITE_AFTER_MS) return null;
  return r;
}

/** The candidate's window (created on first visit). Returns null when expiry is turned off. */
export async function accessWindow(slug: string, email: string, sent?: number | null): Promise<{ start: number; expiresAt: number } | null> {
  if (!(WINDOW_MS > 0)) return null;
  let r = await current(slug, email);
  if (!r) {
    r = sent ? { start: sent, source: "email" } : { start: Date.now(), source: "first-visit" };
    await db.setJSON(key(slug, email), r);
  } else if (sent && sent < r.start && r.source !== "reopened") {
    r = { start: sent, source: "email" };
    await db.setJSON(key(slug, email), r);
  }
  return { start: r.start, expiresAt: r.start + WINDOW_MS };
}

/** Gives the candidate a fresh window starting now (evaluator action). */
export async function reopenAccess(slug: string, email: string, by: string): Promise<number> {
  const r: AccessRecord = { start: Date.now(), source: "reopened", reopenedBy: by };
  await db.setJSON(key(slug, email), r);
  return r.start + WINDOW_MS;
}

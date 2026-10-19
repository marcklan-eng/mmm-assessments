import crypto from "node:crypto";
import { db } from "./db";
import type { ActivityType, Attempt } from "./types";
import { getMeta, RETAKE_MONTHS } from "@/content/assessments";
import { getContent, allQuestions, currentVersion } from "@/content";
import { appendToSheet, sheetConfigured } from "./google";
import { isDateQuestion, isTextQuestion, normalizeDate, itemsOf, pointsEarned, toggleChoice, totalPoints } from "@/content/answers";
import type { SessionUser } from "./auth";

/** Answers arriving up to this long after the deadline are still accepted (network delay). */
export const GRACE_MS = 10_000;

export function addMonths(ms: number, months: number) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export type Eligibility =
  | { state: "not-found" }
  | { state: "coming-soon" }
  | { state: "needs-prerequisite"; prerequisite: string }
  | { state: "in-progress"; attempt: Attempt }
  | { state: "locked"; retakeAfter: number }
  | { state: "eligible" };

async function latestAttempt(slug: string, email: string): Promise<Attempt | null> {
  const id = await db.getLatestId(slug, email);
  if (!id) return null;
  const a = await db.getAttempt(id);
  return a ? finalizeIfExpired(a) : null;
}

export async function getEligibility(slug: string, email: string): Promise<Eligibility> {
  const meta = getMeta(slug);
  if (!meta) return { state: "not-found" };

  if (meta.prerequisite) {
    const pre = await latestAttempt(meta.prerequisite, email);
    if (!pre || pre.status === "in_progress") return { state: "needs-prerequisite", prerequisite: meta.prerequisite };
  }
  if ((await currentVersion(slug)) == null) return { state: "coming-soon" };

  const last = await latestAttempt(slug, email);
  if (last?.status === "in_progress") return { state: "in-progress", attempt: last };
  if (last?.retakeAfter && Date.now() < last.retakeAfter) return { state: "locked", retakeAfter: last.retakeAfter };
  return { state: "eligible" };
}

export async function startAttempt(slug: string, user: SessionUser, name: string): Promise<Attempt> {
  const elig = await getEligibility(slug, user.email);
  if (elig.state === "in-progress") return elig.attempt;
  if (elig.state !== "eligible") throw new HttpError(403, elig.state);

  const meta = getMeta(slug)!;
  const content = (await getContent(slug))!;
  const now = Date.now();
  const optionOrder: Record<string, string[]> = {};
  // Questions and choices appear in the same order as the original Google Form (no shuffling).
  const order = content.sections.map((s) => {
    s.questions.forEach((q) => (optionOrder[q.id] = q.options.map((o) => o.id)));
    return { sectionId: s.id, questionIds: s.questions.map((q) => q.id) };
  });
  const attempt: Attempt = {
    id: crypto.randomUUID(),
    slug,
    email: user.email,
    name: name.trim().slice(0, 120) || user.name || user.email,
    provider: user.provider,
    status: "in_progress",
    version: content.version,
    startedAt: now,
    deadline: now + meta.timeLimitMinutes * 60_000,
    order,
    optionOrder,
    answers: {},
    activity: [],
  };
  await db.saveAttempt(attempt);
  await db.setLatestId(slug, user.email, attempt.id);
  return attempt;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getOwnedAttempt(id: string, email: string): Promise<Attempt> {
  const a = await db.getAttempt(id);
  if (!a || a.email !== email) throw new HttpError(404, "Attempt not found");
  return finalizeIfExpired(a);
}

export async function saveAnswer(a: Attempt, questionId: string, optionId: string | null) {
  if (a.status !== "in_progress") throw new HttpError(409, "already-submitted");
  if (Date.now() > a.deadline + GRACE_MS) throw new HttpError(409, "time-up");
  const content = (await getContent(a.slug, a.version ?? 0))!;
  const q = allQuestions(content).find((x) => x.id === questionId);
  if (!q) throw new HttpError(400, "Unknown question");
  const valid = (id: string) => q.options.some((o) => o.id === id);
  if (optionId === null) delete a.answers[questionId];
  else if (isDateQuestion(q)) {
    // Picked from Month / Day / Year dropdowns, saved as MM/DD/YYYY.
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(optionId) || !normalizeDate(optionId)) throw new HttpError(400, "Invalid date");
    a.answers[questionId] = optionId;
  } else if (isTextQuestion(q)) {
    const text = optionId.replace(/\s+/g, " ").slice(0, 200);
    if (text.trim()) a.answers[questionId] = text;
    else delete a.answers[questionId];
  } else if (q.multi) {
    const ids = optionId.split(",").filter(Boolean);
    if (ids.some((id) => !valid(id))) throw new HttpError(400, "Unknown option");
    const v = toggleChoice(ids.join(","), "");
    if (v) a.answers[questionId] = v;
    else delete a.answers[questionId];
  } else if (q.rows?.length) {
    const parts = optionId.split(",");
    if (parts.length !== q.rows.length || parts.some((p) => p && !valid(p))) throw new HttpError(400, "Unknown option");
    a.answers[questionId] = optionId;
  } else if (valid(optionId)) a.answers[questionId] = optionId;
  else throw new HttpError(400, "Unknown option");
  await db.saveAttempt(a);
}

export async function logActivity(a: Attempt, type: ActivityType) {
  if (a.status !== "in_progress") return;
  if (a.activity.length >= 500) return; // cap
  a.activity.push({ type, at: Date.now() });
  await db.saveAttempt(a);
}

/** Finalize an attempt: score it, set the 6-month retake date, write it to the Sheet. */
export async function finalize(a: Attempt, timedOut: boolean): Promise<Attempt> {
  if (a.status !== "in_progress") return a;
  const meta = getMeta(a.slug)!;
  const qs = allQuestions((await getContent(a.slug, a.version ?? 0))!);
  const score = qs.reduce((t, q) => t + pointsEarned(q, a.answers[q.id]), 0);
  const total = totalPoints(qs);
  const now = Date.now();
  a.status = timedOut ? "timed_out" : "submitted";
  a.submittedAt = timedOut ? Math.min(now, a.deadline) : now;
  a.score = score;
  a.total = total;
  a.percent = Math.round((score / total) * 1000) / 10;
  a.passed = (score / total) * 100 >= meta.passPercent;
  a.retakeAfter = addMonths(a.submittedAt, RETAKE_MONTHS);
  await db.saveAttempt(a);
  await syncToSheet(a);
  return a;
}

export async function syncToSheet(a: Attempt) {
  if (!sheetConfigured || a.sheetSynced) return;
  try {
    await appendToSheet(a);
    a.sheetSynced = true;
    a.sheetError = undefined;
  } catch (e) {
    a.sheetError = (e as Error).message.slice(0, 300);
    console.error("Sheet sync failed", a.id, e);
  }
  await db.saveAttempt(a);
}

export async function finalizeIfExpired(a: Attempt): Promise<Attempt> {
  if (a.status === "in_progress" && Date.now() > a.deadline + GRACE_MS) return finalize(a, true);
  return a;
}

/** All attempts, with any expired ones finalized first (used by the dashboard). */
export async function allAttempts(): Promise<Attempt[]> {
  const list = await db.listAttempts();
  const out: Attempt[] = [];
  for (const a of list) {
    let x = await finalizeIfExpired(a);
    if (x.status !== "in_progress" && !x.sheetSynced && sheetConfigured) {
      await syncToSheet(x); // retry rows that failed to write earlier
      x = (await db.getAttempt(x.id)) ?? x;
    }
    out.push(x);
  }
  return out.sort((p, q) => q.startedAt - p.startedAt);
}

/** The candidate-facing view of an attempt: questions without the answer key. */
export async function publicView(a: Attempt) {
  const content = (await getContent(a.slug, a.version ?? 0))!;
  const meta = getMeta(a.slug)!;
  const byId = new Map(allQuestions(content).map((q) => [q.id, q]));
  let n = 0;
  return {
    attemptId: a.id,
    slug: a.slug,
    title: meta.title,
    name: a.name,
    email: a.email,
    status: a.status,
    serverNow: Date.now(),
    deadline: a.deadline,
    answers: a.answers,
    sections: a.order.map((o) => {
      const s = content.sections.find((x) => x.id === o.sectionId)!;
      return {
        id: s.id,
        title: s.title,
        description: s.description ?? "",
        layout: s.layout ?? null,
        stimuli: (s.stimuli ?? []).map((st) => ({ ...st, url: `/api/asset/${a.slug}/${encodeURIComponent(st.file)}?v=${a.version ?? 0}` })),
        questions: o.questionIds.map((qid) => {
          const q = byId.get(qid)!;
          const opts = a.optionOrder[qid].map((oid) => q.options.find((x) => x.id === oid)!);
          const count = itemsOf(q);
          const number = n + 1;
          n += count;
          return {
            id: q.id,
            number,
            count,
            prompt: q.prompt,
            options: opts,
            rows: q.rows ?? null,
            multi: q.multi ?? null,
            input: isDateQuestion(q) ? ("date" as const) : null,
            media: (q.media ?? []).map((st) => ({ ...st, url: `/api/asset/${a.slug}/${encodeURIComponent(st.file)}?v=${a.version ?? 0}` })),
          };
        }),
      };
    }),
  };
}
export type PublicAttempt = Awaited<ReturnType<typeof publicView>>;

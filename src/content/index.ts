// SERVER ONLY — question sets include the answer key.
//
// Each assessment's questions come from a published, versioned question set (made from the
// "Questions" tab of the results Sheet and stored in the database). Version 0 is the original
// built-in Medical Biller set, used until something newer is published.
// Every attempt remembers the version it was taken on, so changing questions never alters
// past results or attempts in progress.
import type { AssessmentContent, Question } from "./types";
import { medicalBiller } from "./medical-biller";
import { db } from "@/lib/db";

export type QuestionSet = AssessmentContent & {
  version: number;
  publishedAt?: number;
  publishedBy?: string;
};

const BUILT_IN: Record<string, AssessmentContent> = {
  [medicalBiller.slug]: medicalBiller,
};

const currentKey = (slug: string) => `qset:current:${slug}`;
const setKey = (slug: string, v: number) => `qset:${slug}:v${v}`;

// Published versions never change, so they can be cached in memory.
const cache = new Map<string, QuestionSet>();

export function builtIn(slug: string): QuestionSet | undefined {
  const c = BUILT_IN[slug];
  return c ? { ...c, version: 0 } : undefined;
}

export async function currentVersion(slug: string): Promise<number | null> {
  const v = await db.getJSON<number>(currentKey(slug));
  if (typeof v === "number") return v;
  return BUILT_IN[slug] ? 0 : null;
}

/** The question set for a version, or the current one when version is omitted. */
export async function getContent(slug: string, version?: number): Promise<QuestionSet | undefined> {
  const v = version ?? (await currentVersion(slug));
  if (v == null) return undefined;
  if (v === 0) return builtIn(slug);
  const k = setKey(slug, v);
  const hit = cache.get(k);
  if (hit) return hit;
  const set = await db.getJSON<QuestionSet>(k);
  if (set) cache.set(k, set);
  return set ?? undefined;
}

/** Publishes a new version and makes it current. Returns the new version number. */
export async function publishSet(slug: string, content: AssessmentContent, by: string): Promise<number> {
  const prev = (await currentVersion(slug)) ?? 0;
  const version = prev + 1;
  const set: QuestionSet = { ...content, slug, version, publishedAt: Date.now(), publishedBy: by };
  await db.setJSON(setKey(slug, version), set);
  await db.setJSON(currentKey(slug), version);
  return version;
}

export function allQuestions(content: AssessmentContent): Question[] {
  return content.sections.flatMap((s) => s.questions);
}

/** Every image/video file referenced by a question set. */
export function assetFiles(content: AssessmentContent): Set<string> {
  return new Set(content.sections.flatMap((s) => (s.stimuli ?? []).map((st) => st.file)));
}

/** Files shipped with the app (private-assets/<slug>/), usable without uploading. */
export function bundledFiles(slug: string): Set<string> {
  const c = BUILT_IN[slug];
  return c ? assetFiles(c) : new Set();
}

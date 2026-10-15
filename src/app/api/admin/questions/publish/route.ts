import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { readQuestionRows } from "@/lib/google";
import { parseQuestionRows } from "@/lib/questionbank";
import { publishSet } from "@/content";

export const dynamic = "force-dynamic";

// Publishes one assessment's questions from the Questions tab (re-read and re-checked here).
export async function POST(req: Request) {
  return withEvaluator(async (user) => {
    const { slug } = await req.json();
    const rows = await readQuestionRows();
    if (!rows) throw new HttpError(400, "There is no Questions tab in the results Sheet.");
    const parsed = await parseQuestionRows(rows);
    const a = parsed.assessments.find((x) => x.slug === slug);
    if (!a) throw new HttpError(400, "That assessment has no questions in the Questions tab.");
    if (parsed.errors.length || a.errors.length) throw new HttpError(400, "Fix the problems listed first, then check again.");
    if (!a.changed) throw new HttpError(400, "These questions are already live.");
    const version = await publishSet(slug, a.content, user.email);
    return { ok: true, version };
  }, true);
}

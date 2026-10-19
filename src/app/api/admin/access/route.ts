import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { reopenAccess, WINDOW_HOURS } from "@/lib/access";
import { ASSESSMENTS } from "@/content/assessments";

export const dynamic = "force-dynamic";

// Gives a candidate a fresh link window (e.g. 48 hours from now) for one assessment.
export async function POST(req: Request) {
  return withEvaluator(async (user) => {
    const { slug, email } = await req.json();
    const e = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "Enter the candidate's email address.");
    const meta = ASSESSMENTS.find((a) => a.slug === slug);
    if (!meta) throw new HttpError(400, "Pick an assessment.");
    const expiresAt = await reopenAccess(meta.slug, e, user.email);
    return { ok: true, expiresAt, hours: WINDOW_HOURS, title: meta.title };
  });
}

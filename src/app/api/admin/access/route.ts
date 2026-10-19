import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { expiryHours, expirySetting, reopenAccess, setExpiryHours } from "@/lib/access";
import { isEditor } from "@/lib/evaluators";
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
    return { ok: true, expiresAt, hours: await expiryHours(), title: meta.title };
  });
}

// Link expiry setting: { hours } (0 = off). Changing it is limited to editors of the questions Sheet.
export async function GET() {
  return withEvaluator(async () => expirySetting());
}
export async function PUT(req: Request) {
  return withEvaluator(async (user) => {
    if (!(await isEditor(user.email))) throw new HttpError(403, "Only people who can edit the questions Sheet can change this.");
    const cur = await expirySetting();
    if (cur.fromVercel) throw new HttpError(400, "Link expiry is set in Vercel (LINK_EXPIRY_HOURS). Remove that setting to control it here.");
    const hours = Number((await req.json()).hours);
    if (!(Number.isInteger(hours) && hours >= 0 && hours <= 720)) throw new HttpError(400, "Hours must be a whole number from 0 to 720.");
    await setExpiryHours(hours, user.email);
    return expirySetting();
  });
}

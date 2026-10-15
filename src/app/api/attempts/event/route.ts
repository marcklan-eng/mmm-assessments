import { withUser } from "@/lib/api";
import { getOwnedAttempt, logActivity } from "@/lib/attempts";
import { ACTIVITY_LABELS, type ActivityType } from "@/lib/types";

export async function POST(req: Request) {
  return withUser(async (user) => {
    const b = await req.json();
    if (!(b.type in ACTIVITY_LABELS)) return { ok: false };
    const a = await getOwnedAttempt(String(b.attemptId), user.email);
    await logActivity(a, b.type as ActivityType);
    return { ok: true };
  });
}

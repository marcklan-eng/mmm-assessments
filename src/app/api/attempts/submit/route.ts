import { withUser } from "@/lib/api";
import { finalize, getOwnedAttempt, GRACE_MS } from "@/lib/attempts";

export async function POST(req: Request) {
  return withUser(async (user) => {
    const b = await req.json();
    const a = await getOwnedAttempt(String(b.attemptId), user.email);
    if (a.status === "in_progress") {
      const timedOut = b.auto === true || Date.now() > a.deadline + GRACE_MS;
      await finalize(a, timedOut);
    }
    // Deliberately no score / result in the response.
    return { ok: true, slug: a.slug };
  });
}

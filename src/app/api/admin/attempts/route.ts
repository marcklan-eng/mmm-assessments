import { withEvaluator } from "@/lib/adminapi";
import { deleteAttempt, HttpError, restoreAttempt } from "@/lib/attempts";

export const dynamic = "force-dynamic";

// { id, action: "delete" | "restore", reason? } — limited to editors of the questions Sheet.
export async function POST(req: Request) {
  return withEvaluator(async (user) => {
    const b = await req.json();
    const id = String(b.id ?? "");
    if (b.action === "delete") {
      const reason = String(b.reason ?? "").trim();
      if (reason.length < 3) throw new HttpError(400, "Add a short reason (e.g. “test attempt” or “technical issue, retake allowed”).");
      const a = await deleteAttempt(id, user.email, reason);
      return { ok: true, slug: a.slug };
    }
    if (b.action === "restore") {
      const a = await restoreAttempt(id);
      return { ok: true, slug: a.slug };
    }
    throw new HttpError(400, "Unknown action.");
  }, "editor");
}

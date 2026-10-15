import { withUser } from "@/lib/api";
import { HttpError, startAttempt } from "@/lib/attempts";

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await req.json().catch(() => ({}));
    if (body.agreed !== true) throw new HttpError(400, "must-agree");
    const name = String(body.name ?? "").trim();
    if (name.length < 2) throw new HttpError(400, "name-required");
    const a = await startAttempt(String(body.slug), user, name);
    return { attemptId: a.id };
  });
}

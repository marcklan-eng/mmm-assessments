import { withUser } from "@/lib/api";
import { getOwnedAttempt, saveAnswer } from "@/lib/attempts";

export async function POST(req: Request) {
  return withUser(async (user) => {
    const b = await req.json();
    const a = await getOwnedAttempt(String(b.attemptId), user.email);
    await saveAnswer(a, String(b.questionId), b.optionId == null ? null : String(b.optionId));
    return { ok: true, serverNow: Date.now() };
  });
}

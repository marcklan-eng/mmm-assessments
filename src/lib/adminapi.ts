import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";
import { canViewQuestions, isEditor, isEvaluator } from "./evaluators";
import { HttpError } from "./attempts";

/** Who may call: "results" = results Sheet shared with them (dashboard); "questions" = questions Sheet
 *  shared with them; "editor" = can edit the questions Sheet (publish/upload). */
export async function withEvaluator(fn: (u: SessionUser) => Promise<unknown>, role: "results" | "questions" | "editor" = "results") {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const ok =
      role === "editor" ? await isEditor(user.email) : role === "questions" ? await canViewQuestions(user.email) : await isEvaluator(user.email);
    if (!ok) {
      const msg =
        role === "editor"
          ? "Only people who can edit the questions Sheet can do this."
          : role === "questions"
            ? "Ask to have the questions Sheet shared with you."
            : "No dashboard access.";
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    const out = await fn(user);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || "Something went wrong." }, { status: 500 });
  }
}

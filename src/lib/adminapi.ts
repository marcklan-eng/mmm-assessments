import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";
import { isEditor, isEvaluator } from "./evaluators";
import { HttpError } from "./attempts";

/** Runs fn for evaluators (Sheet shared with them) — or only editors when editorOnly. */
export async function withEvaluator(fn: (u: SessionUser) => Promise<unknown>, editorOnly = false) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const ok = editorOnly ? await isEditor(user.email) : await isEvaluator(user.email);
    if (!ok) {
      return NextResponse.json(
        { error: editorOnly ? "Only people who can edit the results Sheet can do this." : "No dashboard access." },
        { status: 403 },
      );
    }
    const out = await fn(user);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: (e as Error).message || "Something went wrong." }, { status: 500 });
  }
}

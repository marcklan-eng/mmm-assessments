import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";
import { HttpError } from "./attempts";

export async function withUser(fn: (u: SessionUser) => Promise<unknown>) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });
    const out = await fn(user);
    return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}

import { withUser } from "@/lib/api";
import { getEligibility, publicView } from "@/lib/attempts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const e = await getEligibility(slug, user.email);
    if (e.state !== "in-progress") return { state: e.state };
    return { state: e.state, attempt: publicView(e.attempt) };
  });
}

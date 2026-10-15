import fs from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import { currentUser } from "@/lib/auth";
import { getEligibility } from "@/lib/attempts";
import { canViewQuestions, isEvaluator } from "@/lib/evaluators";
import { getContent, assetFiles, bundledFiles } from "@/content";
import { listMedia, contentTypeOf, blobToken } from "@/lib/media";

export const dynamic = "force-dynamic";

// Assessment images/videos are only served to a candidate with an active attempt that uses the file,
// or to evaluators (for previews).
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const [slug, rawFile] = (await ctx.params).path;
  const file = decodeURIComponent(rawFile ?? "");
  if (!slug || !file) return new Response("Not found", { status: 404 });

  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let allowed = false;
  const elig = await getEligibility(slug, user.email);
  if (elig.state === "in-progress") {
    const content = await getContent(slug, elig.attempt.version ?? 0);
    allowed = Boolean(content && assetFiles(content).has(file));
  }
  if (!allowed) allowed = (await isEvaluator(user.email)) || (await canViewQuestions(user.email));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const baseHeaders: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  };
  const range = req.headers.get("range");

  // 1. Uploaded on the dashboard (Vercel Blob)
  const uploaded = (await listMedia(slug))[file];
  if (uploaded) {
    const r = await get(uploaded.pathname, { access: "private", token: blobToken, headers: range ? { Range: range } : undefined });
    if (!r || r.statusCode !== 200) return new Response("Not found", { status: 404 });
    const h = new Headers(baseHeaders);
    h.set("Content-Type", uploaded.contentType);
    for (const k of ["content-length", "content-range"]) {
      const v = r.headers.get(k);
      if (v) h.set(k, v);
    }
    return new Response(r.stream, { status: r.headers.get("content-range") ? 206 : 200, headers: h });
  }

  // 2. Shipped with the app
  if (!bundledFiles(slug).has(file)) return new Response("Not found", { status: 404 });
  const full = path.join(process.cwd(), "private-assets", slug, file);
  const size = fs.statSync(full).size;
  const headers = { ...baseHeaders, "Content-Type": contentTypeOf(file) };
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : Math.min(start + 2_000_000, size - 1);
    if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const buf = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(full, "r");
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return new Response(buf, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(buf.length) },
    });
  }
  return new Response(fs.readFileSync(full), { headers: { ...headers, "Content-Length": String(size) } });
}

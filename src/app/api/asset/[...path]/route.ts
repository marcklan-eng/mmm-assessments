import fs from "node:fs";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { getEligibility } from "@/lib/attempts";
import { isEvaluator } from "@/lib/evaluators";
import { getContent, assetFiles } from "@/content";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4" };

// Assessment images/videos are only served to a candidate with an active attempt, or to evaluators.
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const [slug, file] = (await ctx.params).path;
  const content = getContent(slug);
  if (!content || !file || !assetFiles(content).has(file)) return new Response("Not found", { status: 404 });

  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const elig = await getEligibility(slug, user.email);
  if (elig.state !== "in-progress" && !(await isEvaluator(user.email))) return new Response("Forbidden", { status: 403 });

  const full = path.join(process.cwd(), "private-assets", slug, file);
  const size = fs.statSync(full).size;
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  };

  const range = req.headers.get("range");
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

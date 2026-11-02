import crypto from "node:crypto";
import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { ASSESSMENTS } from "@/content/assessments";
import { cleanName, contentTypeOf, mediaKind } from "@/lib/media";
import { MAX_UPLOAD_BYTES, mediaProvider, startGcsUpload } from "@/lib/mediastore";

export const dynamic = "force-dynamic";

// Starts an upload straight from the browser to Google Cloud Storage: { slug, name, size } → { uploadUrl, pathname }.
export async function POST(req: Request) {
  return withEvaluator(async () => {
    if (mediaProvider !== "gcs") throw new HttpError(400, "Cloud Storage isn’t set up (MEDIA_BUCKET).");
    const b = await req.json();
    const slug = String(b.slug ?? "");
    if (!ASSESSMENTS.some((a) => a.slug === slug)) throw new HttpError(400, "Unknown assessment.");
    const name = cleanName(String(b.name ?? ""));
    if (!mediaKind(name)) throw new HttpError(400, "Only images (.png, .jpg, .gif, .webp), videos (.mp4, .webm, .mov) and audio (.mp3, .m4a, .wav, .ogg) are supported.");
    if (Number(b.size) > MAX_UPLOAD_BYTES) throw new HttpError(400, "Files can be up to 200 MB.");
    const pathname = `assessments/${slug}/${name.replace(/(\.[a-z0-9]+)$/, `-${crypto.randomBytes(6).toString("hex")}$1`)}`;
    const uploadUrl = await startGcsUpload(pathname, contentTypeOf(name), req.headers.get("origin"));
    return { uploadUrl, pathname };
  }, "editor");
}

import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { ASSESSMENTS } from "@/content/assessments";
import { assetFiles, bundledFiles, getContent } from "@/content";
import { cleanName, contentTypeOf, listMedia, mediaKind, registerMedia, removeMedia } from "@/lib/media";
import { deleteMediaFile, gcsSize, MAX_UPLOAD_BYTES, mediaConfigured, mediaProvider } from "@/lib/mediastore";

export const dynamic = "force-dynamic";

// List images/videos per assessment (uploaded + shipped with the app).
export async function GET() {
  return withEvaluator(async () => {
    const out = [];
    for (const a of ASSESSMENTS) {
      const uploaded = await listMedia(a.slug);
      const current = await getContent(a.slug);
      const used = current ? assetFiles(current) : new Set<string>();
      const items = [
        ...[...bundledFiles(a.slug)].filter((n) => !uploaded[n]).map((name) => ({ name, source: "built-in", size: null, uploadedAt: null })),
        ...Object.values(uploaded).map((m) => ({ name: m.name, source: "uploaded", size: m.size, uploadedAt: m.uploadedAt })),
      ].map((m) => ({ ...m, kind: mediaKind(m.name), inUse: used.has(m.name) }));
      out.push({ slug: a.slug, title: a.title, items: items.sort((x, y) => x.name.localeCompare(y.name)) });
    }
    return { blobConfigured: mediaConfigured, provider: mediaProvider, assessments: out };
  }, "questions");
}

// Record a finished upload under its file name (called by the page after the upload completes).
export async function POST(req: Request) {
  return withEvaluator(async (user) => {
    const b = await req.json();
    const slug = String(b.slug);
    if (!ASSESSMENTS.some((a) => a.slug === slug)) throw new HttpError(400, "Unknown assessment.");
    const name = cleanName(String(b.name));
    if (!mediaKind(name)) throw new HttpError(400, "Only images (.png, .jpg, .gif, .webp) and videos (.mp4, .webm, .mov) are supported.");
    const pathname = String(b.pathname);
    if (!pathname.startsWith(`assessments/${slug}/`)) throw new HttpError(400, "Unexpected upload location.");
    const store = mediaProvider === "gcs" ? "gcs" : "blob";
    let size = Number(b.size) || 0;
    if (store === "gcs") {
      const actual = await gcsSize(pathname);
      if (actual == null) throw new HttpError(400, "The upload didn’t finish. Please try again.");
      if (actual > MAX_UPLOAD_BYTES) {
        await deleteMediaFile({ name, pathname, store, contentType: "", size: actual, uploadedAt: 0, uploadedBy: "" });
        throw new HttpError(400, "Files can be up to 200 MB.");
      }
      size = actual;
    }
    const prev = (await listMedia(slug))[name];
    if (prev && prev.pathname !== pathname) await deleteMediaFile(prev);
    await registerMedia(slug, { name, pathname, store, contentType: contentTypeOf(name), size, uploadedAt: Date.now(), uploadedBy: user.email });
    return { ok: true, name, replaced: Boolean(prev) };
  }, "editor");
}

// Remove an uploaded file (not allowed while the live questions use it).
export async function DELETE(req: Request) {
  return withEvaluator(async () => {
    const { slug, name } = await req.json();
    const item = (await listMedia(slug))[name];
    if (!item) throw new HttpError(404, "File not found.");
    const current = await getContent(slug);
    if (current && assetFiles(current).has(name)) throw new HttpError(400, "The live questions use this file. Publish questions without it first.");
    await deleteMediaFile(item);
    await removeMedia(slug, name);
    return { ok: true };
  }, "editor");
}

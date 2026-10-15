import { del } from "@vercel/blob";
import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { ASSESSMENTS } from "@/content/assessments";
import { assetFiles, bundledFiles, getContent } from "@/content";
import { blobConfigured, cleanName, contentTypeOf, listMedia, mediaKind, registerMedia, removeMedia } from "@/lib/media";

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
    return { blobConfigured, assessments: out };
  });
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
    const prev = (await listMedia(slug))[name];
    if (prev && prev.pathname !== pathname && blobConfigured) await del(prev.pathname).catch(() => {});
    await registerMedia(slug, { name, pathname, contentType: contentTypeOf(name), size: Number(b.size) || 0, uploadedAt: Date.now(), uploadedBy: user.email });
    return { ok: true, name, replaced: Boolean(prev) };
  }, true);
}

// Remove an uploaded file (not allowed while the live questions use it).
export async function DELETE(req: Request) {
  return withEvaluator(async () => {
    const { slug, name } = await req.json();
    const item = (await listMedia(slug))[name];
    if (!item) throw new HttpError(404, "File not found.");
    const current = await getContent(slug);
    if (current && assetFiles(current).has(name)) throw new HttpError(400, "The live questions use this file. Publish questions without it first.");
    if (blobConfigured) await del(item.pathname).catch(() => {});
    await removeMedia(slug, name);
    return { ok: true };
  }, true);
}

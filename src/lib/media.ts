// Images and videos for question sets: uploaded on the dashboard to Vercel Blob (private),
// referenced by file name in the Questions tab, and served only through /api/asset.
import { db } from "./db";
import { bundledFiles } from "@/content";

export type MediaItem = {
  name: string; // the file name used in the Questions tab, e.g. "superbill-1.png"
  pathname: string; // where it lives in Blob storage
  contentType: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
};

export const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
export const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

export function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
export function mediaKind(name: string): "image" | "video" | null {
  const e = extOf(name);
  return IMAGE_TYPES[e] ? "image" : VIDEO_TYPES[e] ? "video" : null;
}
export function contentTypeOf(name: string) {
  const e = extOf(name);
  return IMAGE_TYPES[e] ?? VIDEO_TYPES[e] ?? "application/octet-stream";
}

/** Normalizes an uploaded file name: lowercase, spaces to dashes, safe characters only. */
export function cleanName(name: string) {
  const ext = extOf(name);
  const base = name.slice(0, name.length - ext.length - 1);
  const b = base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-").slice(0, 80) || "file";
  return `${b}.${ext}`;
}

const key = (slug: string) => `media:${slug}`;

export async function listMedia(slug: string): Promise<Record<string, MediaItem>> {
  return (await db.getJSON<Record<string, MediaItem>>(key(slug))) ?? {};
}

export async function registerMedia(slug: string, item: MediaItem) {
  const all = await listMedia(slug);
  all[item.name] = item;
  await db.setJSON(key(slug), all);
}

export async function removeMedia(slug: string, name: string) {
  const all = await listMedia(slug);
  delete all[name];
  await db.setJSON(key(slug), all);
}

/** Uploaded files plus the ones shipped with the app. */
export async function availableMedia(slug: string): Promise<Set<string>> {
  const uploaded = Object.keys(await listMedia(slug));
  return new Set([...uploaded, ...bundledFiles(slug)]);
}

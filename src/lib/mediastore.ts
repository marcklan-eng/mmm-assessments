// Where uploaded media files live: Google Cloud Storage (MEDIA_BUCKET) on Google Cloud,
// Vercel Blob (BLOB_READ_WRITE_TOKEN) on Vercel. Files shipped with the app live in private-assets/.
import { del, get } from "@vercel/blob";
import { blobToken, type MediaItem } from "./media";

export const mediaBucket = process.env.MEDIA_BUCKET?.trim() || "";
export const mediaProvider: "gcs" | "blob" | null = mediaBucket ? "gcs" : blobToken ? "blob" : null;
export const mediaConfigured = mediaProvider !== null;
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

type Bucket = import("@google-cloud/storage").Bucket;
let bucketCache: Bucket | null = null;
function bucket(): Bucket {
  if (!bucketCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require("@google-cloud/storage") as typeof import("@google-cloud/storage");
    const storage = new Storage(process.env.STORAGE_EMULATOR_HOST ? { apiEndpoint: process.env.STORAGE_EMULATOR_HOST, projectId: "test" } : {});
    bucketCache = storage.bucket(mediaBucket);
  }
  return bucketCache;
}

/** Starts a browser upload straight to Cloud Storage; returns the one-time upload URL (no keys reach the browser). */
export async function startGcsUpload(pathname: string, contentType: string, origin: string | null): Promise<string> {
  const [uri] = await bucket().file(pathname).createResumableUpload({
    metadata: { contentType },
    ...(origin ? { origin } : {}),
  });
  return uri;
}

/** Size of an uploaded Cloud Storage object (null if it isn't there). */
export async function gcsSize(pathname: string): Promise<number | null> {
  try {
    const [m] = await bucket().file(pathname).getMetadata();
    return Number(m.size ?? 0);
  } catch {
    return null;
  }
}

function storeOf(item: MediaItem): "gcs" | "blob" {
  return item.store ?? "blob";
}

/** Streams an uploaded file, honoring a Range header. */
export async function readMedia(item: MediaItem, range: string | null): Promise<Response | null> {
  const base: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "Content-Type": item.contentType,
  };
  if (storeOf(item) === "blob") {
    if (!blobToken) return null;
    const r = await get(item.pathname, { access: "private", token: blobToken, headers: range ? { Range: range } : undefined });
    if (!r || r.statusCode !== 200) return null;
    const h = new Headers(base);
    for (const k of ["content-length", "content-range"]) {
      const v = r.headers.get(k);
      if (v) h.set(k, v);
    }
    return new Response(r.stream, { status: r.headers.get("content-range") ? 206 : 200, headers: h });
  }
  if (!mediaBucket) return null;
  const size = await gcsSize(item.pathname);
  if (size == null) return null;
  const f = bucket().file(item.pathname);
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  const toWeb = (s: NodeJS.ReadableStream) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Readable } = require("node:stream") as typeof import("node:stream");
    return Readable.toWeb(s as import("node:stream").Readable) as unknown as ReadableStream;
  };
  if (m && size > 0) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(size - parseInt(m[2] || "0", 10), 0);
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(toWeb(f.createReadStream({ start, end })), {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(toWeb(f.createReadStream()), { headers: { ...base, "Content-Length": String(size) } });
}

/** Deletes an uploaded file from wherever it lives (errors ignored: it may already be gone). */
export async function deleteMediaFile(item: MediaItem): Promise<void> {
  if (storeOf(item) === "blob") {
    if (blobToken) await del(item.pathname, { token: blobToken }).catch(() => {});
    return;
  }
  if (mediaBucket) await bucket().file(item.pathname).delete({ ignoreNotFound: true }).catch(() => {});
}

/** Copies bytes into Cloud Storage (used when importing files from the old Vercel storage). */
export async function putGcs(pathname: string, data: Buffer, contentType: string): Promise<void> {
  await bucket().file(pathname).save(data, { contentType, resumable: false });
}

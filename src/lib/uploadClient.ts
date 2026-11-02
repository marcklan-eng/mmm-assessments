"use client";
// Uploads one media file from the browser and registers it under its file name.
// Google Cloud Storage: straight to the bucket with a one-time upload URL. Vercel Blob: through Blob's client upload.
import { upload } from "@vercel/blob/client";

export async function uploadMediaFile(
  slug: string,
  file: File,
  provider: "gcs" | "blob" | null,
  onProgress: (pct: number) => void,
): Promise<{ name: string; replaced: boolean }> {
  let pathname: string;
  if (provider === "gcs") {
    const s = await fetch("/api/admin/media/gcs-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name: file.name, size: file.size }),
    });
    const sj = await s.json().catch(() => ({}));
    if (!s.ok) throw new Error(sj.error || "Couldn’t start the upload.");
    pathname = sj.pathname;
    await new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("PUT", sj.uploadUrl);
      x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status}).`)));
      x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
      x.send(file);
    });
  } else {
    const safe = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
    const blob = await upload(`assessments/${slug}/${safe}`, file, {
      access: "private",
      handleUploadUrl: "/api/admin/media/upload",
      clientPayload: slug,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (p) => onProgress(Math.round(p.percentage)),
    });
    pathname = blob.pathname;
  }
  const r = await fetch("/api/admin/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, name: file.name, pathname, size: file.size }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Upload failed.");
  return j;
}

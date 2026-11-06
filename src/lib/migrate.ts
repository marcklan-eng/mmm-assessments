// One-time copy from the old app's storage (Upstash Redis + Vercel Blob) into this app's storage:
// either a new Vercel account (its own Upstash + Blob) or Google Cloud (Firestore + Cloud Storage).
// Needs OLD_KV_REST_API_URL / OLD_KV_REST_API_TOKEN (and OLD_BLOB_READ_WRITE_TOKEN for uploaded media) set as secrets.
// Safe to run more than once: it copies everything again, replacing the same items in the new storage.
import { Redis } from "@upstash/redis";
import { get, put } from "@vercel/blob";
import { db, storageKind, redisUrl } from "./db";
import { blobToken } from "./media";
import type { Attempt } from "./types";
import type { MediaItem } from "./media";
import { mediaProvider, putGcs } from "./mediastore";

const oldUrl = process.env.OLD_KV_REST_API_URL || process.env.OLD_UPSTASH_REDIS_REST_URL || "";
const oldToken = process.env.OLD_KV_REST_API_TOKEN || process.env.OLD_UPSTASH_REDIS_REST_TOKEN || "";
const oldBlob = process.env.OLD_BLOB_READ_WRITE_TOKEN || "";
export const migrationAvailable = Boolean(oldUrl && oldToken);
const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
/** Where the import copies to, or why it can't. */
export function migrationTarget(): { ok: boolean; label: string } {
  if (storageKind === "firestore") return { ok: true, label: "Firestore" };
  if (storageKind === "redis") {
    if (oldUrl && norm(oldUrl) === norm(redisUrl)) return { ok: false, label: "the same Upstash database as the old app (nothing to copy)" };
    return { ok: true, label: "this account’s Upstash database" };
  }
  return { ok: false, label: "no database connected yet" };
}
const sameBlobStore = Boolean(oldBlob && blobToken && oldBlob === blobToken);

export type MigrationReport = {
  attempts: number;
  candidates: number;
  settings: number;
  mediaCopied: number;
  mediaSkipped: string[];
  errors: string[];
};

async function scanKeys(r: Redis, match: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | number = 0;
  do {
    const [next, keys] = (await r.scan(cursor, { match, count: 500 })) as [string | number, string[]];
    out.push(...keys);
    cursor = next;
  } while (String(cursor) !== "0");
  return out;
}

async function inChunks<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < xs.length; i += n) await Promise.all(xs.slice(i, i + n).map(fn));
}

export async function runMigration(): Promise<MigrationReport> {
  if (!migrationAvailable) throw new Error("Set OLD_KV_REST_API_URL and OLD_KV_REST_API_TOKEN (the Upstash settings from Vercel) first.");
  const target = migrationTarget();
  if (!target.ok) throw new Error(`Can’t import: this app is using ${target.label}.`);
  const r = new Redis({ url: oldUrl, token: oldToken });
  const rep: MigrationReport = { attempts: 0, candidates: 0, settings: 0, mediaCopied: 0, mediaSkipped: [], errors: [] };

  // 1. Attempts (deleted ones, e.g. test attempts, are left behind)
  const copied = new Set<string>();
  const ids = ((await r.smembers("attempts")) as string[]) ?? [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await r.mget<(Attempt | null)[]>(...chunk.map((id) => `attempt:${id}`));
    await inChunks(rows.filter((a): a is Attempt => Boolean(a) && !a!.deletedAt), 20, async (a) => {
      try {
        await db.saveAttempt(a);
        copied.add(a.id);
        rep.attempts++;
      } catch (e) {
        rep.errors.push(`Attempt ${a.id}: ${(e as Error).message}`);
      }
    });
  }

  // 2. Each candidate's latest attempt per assessment ("latest:slug:email")
  const latest = await scanKeys(r, "latest:*");
  await inChunks(latest, 20, async (k) => {
    const id = await r.get<string>(k);
    const rest = k.slice("latest:".length);
    const i = rest.indexOf(":");
    if (!id || i < 0 || !copied.has(id)) return;
    await db.setLatestId(rest.slice(0, i), rest.slice(i + 1), id);
    rep.candidates++;
  });

  // 3. Settings, published question sets, media lists, link expiry, …
  const kvKeys = await scanKeys(r, "kv:*");
  await inChunks(kvKeys, 20, async (k) => {
    const v = await r.get(k);
    if (v == null) return;
    await db.setJSON(k.slice("kv:".length), v);
    rep.settings++;
  });

  // 4. Uploaded media files: copy from the old Vercel Blob store into this app's Cloud Storage bucket or Blob store
  for (const k of kvKeys.filter((x) => x.startsWith("kv:media:"))) {
    const key = k.slice("kv:".length);
    const list = (await db.getJSON<Record<string, MediaItem>>(key)) ?? {};
    let changed = false;
    for (const item of Object.values(list)) {
      if (item.store === "gcs") continue;
      if (mediaProvider === "blob" && sameBlobStore) continue; // already in this app's store
      if (!mediaProvider || !oldBlob) {
        rep.mediaSkipped.push(item.name);
        continue;
      }
      try {
        const g = await get(item.pathname, { access: "private", token: oldBlob });
        if (!g || g.statusCode !== 200) throw new Error("not found in Vercel Blob");
        const buf = Buffer.from(await new Response(g.stream).arrayBuffer());
        if (mediaProvider === "gcs") {
          await putGcs(item.pathname, buf, item.contentType);
          item.store = "gcs";
        } else {
          await put(item.pathname, buf, { access: "private", token: blobToken, contentType: item.contentType, addRandomSuffix: false, allowOverwrite: true });
          item.store = "blob";
        }
        changed = true;
        rep.mediaCopied++;
      } catch (e) {
        rep.errors.push(`${item.name}: ${(e as Error).message}`);
      }
    }
    if (changed) await db.setJSON(key, list);
  }
  return rep;
}

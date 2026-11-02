// One-time move from the Vercel setup (Upstash Redis + Vercel Blob) to Google Cloud (Firestore + Cloud Storage).
// Needs OLD_KV_REST_API_URL / OLD_KV_REST_API_TOKEN (and OLD_BLOB_READ_WRITE_TOKEN for uploaded media) set as secrets.
// Safe to run more than once: it copies everything again, replacing the same items in the new storage.
import { Redis } from "@upstash/redis";
import { get } from "@vercel/blob";
import { db, storageKind } from "./db";
import type { Attempt } from "./types";
import type { MediaItem } from "./media";
import { mediaProvider, putGcs } from "./mediastore";

const oldUrl = process.env.OLD_KV_REST_API_URL || process.env.OLD_UPSTASH_REDIS_REST_URL || "";
const oldToken = process.env.OLD_KV_REST_API_TOKEN || process.env.OLD_UPSTASH_REDIS_REST_TOKEN || "";
const oldBlob = process.env.OLD_BLOB_READ_WRITE_TOKEN || "";
export const migrationAvailable = Boolean(oldUrl && oldToken);

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
  if (storageKind !== "firestore") throw new Error("This app isn’t using Firestore yet, so there’s nothing to import into.");
  const r = new Redis({ url: oldUrl, token: oldToken });
  const rep: MigrationReport = { attempts: 0, candidates: 0, settings: 0, mediaCopied: 0, mediaSkipped: [], errors: [] };

  // 1. Attempts
  const ids = ((await r.smembers("attempts")) as string[]) ?? [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await r.mget<(Attempt | null)[]>(...chunk.map((id) => `attempt:${id}`));
    await inChunks(rows.filter((a): a is Attempt => Boolean(a)), 20, async (a) => {
      try {
        await db.saveAttempt(a);
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
    if (!id || i < 0) return;
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

  // 4. Uploaded media files: copy from Vercel Blob into Cloud Storage
  for (const k of kvKeys.filter((x) => x.startsWith("kv:media:"))) {
    const key = k.slice("kv:".length);
    const list = (await db.getJSON<Record<string, MediaItem>>(key)) ?? {};
    let changed = false;
    for (const item of Object.values(list)) {
      if (item.store === "gcs") continue;
      if (mediaProvider !== "gcs" || !oldBlob) {
        rep.mediaSkipped.push(item.name);
        continue;
      }
      try {
        const g = await get(item.pathname, { access: "private", token: oldBlob });
        if (!g || g.statusCode !== 200) throw new Error("not found in Vercel Blob");
        const buf = Buffer.from(await new Response(g.stream).arrayBuffer());
        await putGcs(item.pathname, buf, item.contentType);
        item.store = "gcs";
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

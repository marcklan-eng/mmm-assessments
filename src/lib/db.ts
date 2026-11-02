// Storage: Google Firestore on Google Cloud (AI Studio / Cloud Run), Upstash Redis on Vercel,
// a local JSON file in development.
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import type { Attempt } from "./types";

export interface Store {
  getAttempt(id: string): Promise<Attempt | null>;
  saveAttempt(a: Attempt): Promise<void>;
  listAttempts(): Promise<Attempt[]>;
  getLatestId(slug: string, email: string): Promise<string | null>;
  setLatestId(slug: string, email: string, id: string): Promise<void>;
  /** Generic JSON values (question sets, media registry). */
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

const latestKey = (slug: string, email: string) => `latest:${slug}:${email.toLowerCase()}`;

function redisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token });
  return {
    async getAttempt(id) {
      return (await redis.get<Attempt>(`attempt:${id}`)) ?? null;
    },
    async saveAttempt(a) {
      await redis.set(`attempt:${a.id}`, a);
      await redis.sadd("attempts", a.id);
    },
    async listAttempts() {
      const ids = (await redis.smembers("attempts")) as string[];
      const out: Attempt[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const rows = await redis.mget<(Attempt | null)[]>(...chunk.map((id) => `attempt:${id}`));
        rows.forEach((r) => r && out.push(r));
      }
      return out;
    },
    async getLatestId(slug, email) {
      return (await redis.get<string>(latestKey(slug, email))) ?? null;
    },
    async setLatestId(slug, email, id) {
      await redis.set(latestKey(slug, email), id);
    },
    async getJSON<T>(key: string) {
      return ((await redis.get<T>(`kv:${key}`)) ?? null) as T | null;
    },
    async setJSON(key, value) {
      await redis.set(`kv:${key}`, value);
    },
  };
}

type FileData = { attempts: Record<string, Attempt>; latest: Record<string, string>; kv?: Record<string, unknown> };

function fileStore(): Store {
  const file = path.join(process.cwd(), ".data", "db.json");
  const read = (): FileData => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return { attempts: {}, latest: {} };
    }
  };
  const write = (d: FileData) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(d, null, 2));
  };
  return {
    async getAttempt(id) {
      return read().attempts[id] ?? null;
    },
    async saveAttempt(a) {
      const d = read();
      d.attempts[a.id] = a;
      write(d);
    },
    async listAttempts() {
      return Object.values(read().attempts);
    },
    async getLatestId(slug, email) {
      return read().latest[latestKey(slug, email)] ?? null;
    },
    async setLatestId(slug, email, id) {
      const d = read();
      d.latest[latestKey(slug, email)] = id;
      write(d);
    },
    async getJSON<T>(key: string) {
      return ((read().kv ?? {})[key] ?? null) as T | null;
    },
    async setJSON(key, value) {
      const d = read();
      d.kv = { ...(d.kv ?? {}), [key]: value };
      write(d);
    },
  };
}

// ---------- Firestore ----------
// Collections: attempts/{id}, latest/{slug:email}, kv/{key}. Each document keeps the JSON in a
// "json" string field (Firestore doesn't allow some nested shapes, and this keeps documents identical
// to the other stores), plus a few plain fields for reading in the Firebase console.

/** The few Firestore calls used here (so a stand-in can be used in tests). */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
    get(): Promise<{ docs: { data(): Record<string, unknown> }[] }>;
  };
}

const docId = (s: string) => encodeURIComponent(s).replace(/\./g, "%2E"); // Firestore ids can't contain "/" or be "." / ".."

export function firestoreStore(fs: FirestoreLike): Store {
  const parse = <T,>(d: Record<string, unknown> | undefined): T | null => (d && typeof d.json === "string" ? (JSON.parse(d.json) as T) : null);
  return {
    async getAttempt(id) {
      const s = await fs.collection("attempts").doc(docId(id)).get();
      return s.exists ? parse<Attempt>(s.data()) : null;
    },
    async saveAttempt(a) {
      await fs.collection("attempts").doc(docId(a.id)).set({
        json: JSON.stringify(a),
        slug: a.slug,
        email: a.email,
        status: a.status,
        startedAt: a.startedAt,
        deleted: Boolean(a.deletedAt),
      });
    },
    async listAttempts() {
      const snap = await fs.collection("attempts").get();
      return snap.docs.map((d) => parse<Attempt>(d.data())).filter((a): a is Attempt => Boolean(a));
    },
    async getLatestId(slug, email) {
      const s = await fs.collection("latest").doc(docId(latestKey(slug, email))).get();
      return s.exists ? ((s.data()?.id as string) ?? null) : null;
    },
    async setLatestId(slug, email, id) {
      await fs.collection("latest").doc(docId(latestKey(slug, email))).set({ id, slug, email: email.toLowerCase() });
    },
    async getJSON<T>(key: string) {
      const s = await fs.collection("kv").doc(docId(key)).get();
      return s.exists ? parse<T>(s.data()) : null;
    },
    async setJSON(key, value) {
      await fs.collection("kv").doc(docId(key)).set({ json: JSON.stringify(value), key, updatedAt: Date.now() });
    },
  };
}

/** Test stand-in for Firestore (a JSON file), used only when FIRESTORE_FAKE_FILE is set. */
function fakeFirestore(file: string): FirestoreLike {
  const read = (): Record<string, Record<string, Record<string, unknown>>> => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  };
  return {
    collection(name) {
      return {
        doc(id) {
          if (id.includes("/") || id === "." || id === "..") throw new Error(`Invalid document id ${id}`);
          return {
            async get() {
              const d = read()[name]?.[id];
              return { exists: Boolean(d), data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
            },
            async set(data) {
              const all = read();
              all[name] = { ...(all[name] ?? {}), [id]: JSON.parse(JSON.stringify(data)) };
              fs.mkdirSync(path.dirname(file), { recursive: true });
              fs.writeFileSync(file, JSON.stringify(all));
            },
          };
        },
        async get() {
          return { docs: Object.values(read()[name] ?? {}).map((d) => ({ data: () => d })) };
        },
      };
    },
  };
}

function googleFirestore(): Store {
  if (process.env.FIRESTORE_FAKE_FILE) return firestoreStore(fakeFirestore(process.env.FIRESTORE_FAKE_FILE));
  // Loaded only when used, so the Vercel build doesn't need Google credentials.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Firestore } = require("@google-cloud/firestore") as typeof import("@google-cloud/firestore");
  const fs = new Firestore({
    ...(process.env.FIRESTORE_PROJECT_ID ? { projectId: process.env.FIRESTORE_PROJECT_ID } : {}),
    ...(process.env.FIRESTORE_DATABASE_ID ? { databaseId: process.env.FIRESTORE_DATABASE_ID } : {}),
    ignoreUndefinedProperties: true,
  });
  return firestoreStore(fs as unknown as FirestoreLike);
}

// ---------- Which store ----------
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
/** On Google Cloud Run (K_SERVICE is set there) or when asked for explicitly. */
const wantFirestore =
  process.env.STORAGE === "firestore" || (process.env.STORAGE !== "redis" && !(url && token) && Boolean(process.env.K_SERVICE || process.env.FIRESTORE_PROJECT_ID));

export const storageKind: "firestore" | "redis" | "file" = wantFirestore ? "firestore" : url && token ? "redis" : "file";
export const db: Store = storageKind === "firestore" ? googleFirestore() : storageKind === "redis" ? redisStore(url!, token!) : fileStore();
/** Durable storage (anything but the local development file). */
export const usingRedis = storageKind !== "file";
export { redisStore };

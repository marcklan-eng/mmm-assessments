// Storage: Upstash Redis in production (Vercel Marketplace), a local JSON file in development.
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import type { Attempt } from "./types";

interface Store {
  getAttempt(id: string): Promise<Attempt | null>;
  saveAttempt(a: Attempt): Promise<void>;
  listAttempts(): Promise<Attempt[]>;
  getLatestId(slug: string, email: string): Promise<string | null>;
  setLatestId(slug: string, email: string, id: string): Promise<void>;
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
  };
}

type FileData = { attempts: Record<string, Attempt>; latest: Record<string, string> };

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
  };
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const db: Store = url && token ? redisStore(url, token) : fileStore();
export const usingRedis = Boolean(url && token);

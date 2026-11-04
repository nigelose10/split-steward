import { AppError } from "@/lib/errors";
import type { Group } from "@/lib/types";

export type Store = {
  saveGroup(group: Group): Promise<void>;
  getGroup(id: string): Promise<Group | undefined>;
  listGroups(): Promise<Group[]>;
  hasEvent(id: string): Promise<boolean>;
  recordEvent(id: string): Promise<void>;
};

export function createMemoryStore(): Store {
  const groups = new Map<string, Group>();
  const events = new Set<string>();
  return {
    async saveGroup(group) {
      groups.set(group.id, structuredClone(group));
    },
    async getGroup(id) {
      const group = groups.get(id);
      return group ? structuredClone(group) : undefined;
    },
    async listGroups() {
      return [...groups.values()]
        .map((group) => structuredClone(group))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async hasEvent(id) {
      return events.has(id);
    },
    async recordEvent(id) {
      events.add(id);
    },
  };
}

type UpstashResponse = { result?: unknown; error?: string };

export function createUpstashStore(url: string, token: string): Store {
  const endpoint = url.replace(/\/$/, "");

  async function command(args: string[]): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      throw new AppError(`Upstash request failed (${response.status}).`, "STORE", 502);
    }
    const json = (await response.json()) as UpstashResponse;
    if (json.error) throw new AppError(json.error, "STORE", 502);
    return json.result ?? null;
  }

  return {
    async saveGroup(group) {
      await command(["SET", groupKey(group.id), JSON.stringify(group)]);
      const existing = await readIds(command);
      if (!existing.includes(group.id)) {
        existing.push(group.id);
        await command(["SET", idsKey(), JSON.stringify(existing)]);
      }
    },
    async getGroup(id) {
      const raw = await command(["GET", groupKey(id)]);
      if (typeof raw !== "string" || !raw) return undefined;
      return JSON.parse(raw) as Group;
    },
    async listGroups() {
      const ids = await readIds(command);
      const groups = await Promise.all(ids.map((id) => this.getGroup(id)));
      return groups
        .filter((group): group is Group => Boolean(group))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async hasEvent(id) {
      const raw = await command(["GET", eventKey(id)]);
      return raw === "1";
    },
    async recordEvent(id) {
      await command(["SET", eventKey(id), "1"]);
    },
  };
}

async function readIds(command: (args: string[]) => Promise<unknown>): Promise<string[]> {
  const raw = await command(["GET", idsKey()]);
  if (typeof raw !== "string" || !raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
}

function groupKey(id: string): string {
  return `split-steward:group:${id}`;
}

function idsKey(): string {
  return "split-steward:group-ids";
}

function eventKey(id: string): string {
  return `split-steward:event:${id}`;
}

const globalStore = globalThis as typeof globalThis & {
  __splitStewardStore?: Store;
};

export function getStore(): Store {
  if (!globalStore.__splitStewardStore) {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    globalStore.__splitStewardStore =
      url && token ? createUpstashStore(url, token) : createMemoryStore();
  }
  return globalStore.__splitStewardStore;
}

export function setStoreForTests(store: Store | null): void {
  globalStore.__splitStewardStore = store ?? undefined;
}

import { describe, expect, it } from "vitest";
import { createUpstashStore } from "@/lib/store";
import type { Group } from "@/lib/types";

const group: Group = {
  id: "grp_1",
  createdAt: "2026-11-04T12:00:00.000Z",
  title: "Cabin weekend",
  sourceText: "note",
  proposal: {
    title: "Cabin weekend",
    narrative: "mock",
    assumptions: [],
    expenses: [],
    balances: [],
    transfers: [],
    mathReasoning: "",
    ai: { mode: "mock", model: null, disclaimer: "Mock AI." },
  },
  charges: [],
  emails: {},
};

describe("Upstash store", () => {
  it("round-trips a group through the REST command API", async () => {
    const data = new Map<string, string>();
    const fetchSpy = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const command = JSON.parse(String(init?.body)) as string[];
      const [op, key, value] = command;
      if (op === "SET" && key && value) data.set(key, value);
      return Response.json({ result: op === "GET" && key ? (data.get(key) ?? null) : "OK" });
    };
    try {
      const store = createUpstashStore("https://example.upstash.io", "token");
      await store.saveGroup(group);
      await store.recordEvent("evt_1");
      expect(await store.getGroup("grp_1")).toMatchObject({ id: "grp_1", title: "Cabin weekend" });
      expect(await store.listGroups()).toHaveLength(1);
      expect(await store.hasEvent("evt_1")).toBe(true);
      expect(data.get("split-steward:group:grp_1")).toContain("Cabin weekend");
    } finally {
      globalThis.fetch = fetchSpy;
    }
  });
});

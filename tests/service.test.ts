import { afterEach, describe, expect, it } from "vitest";
import { POST as approveRoute } from "@/app/api/groups/[id]/charges/[chargeId]/approve/route";
import { POST as paypalRoute } from "@/app/api/groups/[id]/charges/[chargeId]/paypal/route";
import { POST as webhookRoute } from "@/app/api/paypal/webhook/route";
import { AppError } from "@/lib/errors";
import { MOCK_INVOICE_DISCLAIMER, MOCK_ORDER_DISCLAIMER, type PayPalClient } from "@/lib/paypal";
import { samples } from "@/lib/samples";
import { applyWebhook, createPayPalCharge, proposeGroup, rejectGroupCharge } from "@/lib/service";
import { createMemoryStore, setStoreForTests, type Store } from "@/lib/store";
import type { PayPalCreateInput, PayPalRecord } from "@/lib/types";

const envSnapshot = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
  setStoreForTests(null);
});

function fakePayPal() {
  const calls: string[] = [];
  const client: PayPalClient = {
    mode: "mock",
    async createOrder(input) {
      calls.push(`order:${input.chargeId}`);
      return record("order", input);
    },
    async createInvoice(input) {
      calls.push(`invoice:${input.recipientEmail}`);
      return record("invoice", input);
    },
    async captureOrder() {
      throw new Error("capture should not run");
    },
    async verifyWebhook() {
      return false;
    },
  };
  return { client, calls };
}

function record(kind: "order" | "invoice", input: PayPalCreateInput): PayPalRecord {
  return {
    mode: "mock",
    kind,
    id: kind === "order" ? `MOCK-ORDER-${input.chargeId}` : `MOCK-INVOICE-${input.chargeId}`,
    status: kind === "order" ? "CREATED" : "SENT",
    approveUrl: kind === "order" ? `/mock/checkout/MOCK-ORDER-${input.chargeId}` : null,
    disclaimer: kind === "order" ? MOCK_ORDER_DISCLAIMER : MOCK_INVOICE_DISCLAIMER,
  };
}

async function cabin(store: Store) {
  return proposeGroup({ store, text: samples[1]!.text, now: "2026-11-04T12:00:00.000Z" });
}

describe("service approval gate", () => {
  it("does not call PayPal until the debtor approves, then labels the result a simulation", async () => {
    const store = createMemoryStore();
    const paypal = fakePayPal();
    const group = await cabin(store);
    const noah = group.charges.find((charge) => charge.from === "Noah");
    const elena = group.charges.find((charge) => charge.from === "Elena");
    expect(noah).toBeTruthy();
    expect(elena).toBeTruthy();

    await expect(
      createPayPalCharge({
        store,
        paypal: paypal.client,
        groupId: group.id,
        chargeId: noah!.id,
        actor: "Noah",
        kind: "order",
        appUrl: "http://127.0.0.1:3000",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(paypal.calls).toEqual([]);

    const request = new Request("http://localhost/approve", {
      method: "POST",
      body: JSON.stringify({ actor: "Elena" }),
    });
    setStoreForTests(store);
    const forbidden = await approveRoute(request, {
      params: Promise.resolve({ id: group.id, chargeId: noah!.id }),
    });
    expect(forbidden.status).toBe(403);

    const approvedResponse = await approveRoute(
      new Request("http://localhost/approve", {
        method: "POST",
        body: JSON.stringify({ actor: "Noah" }),
      }),
      { params: Promise.resolve({ id: group.id, chargeId: noah!.id }) },
    );
    expect(approvedResponse.status).toBe(200);

    const createdResponse = await paypalRoute(
      new Request("http://localhost/paypal", {
        method: "POST",
        body: JSON.stringify({ actor: "Noah", kind: "order" }),
      }),
      { params: Promise.resolve({ id: group.id, chargeId: noah!.id }) },
    );
    expect(createdResponse.status).toBe(200);
    const created = (await createdResponse.json()) as {
      group: { charges: Array<{ id: string; status: string; paypal: PayPalRecord | null }> };
    };
    const paid = created.group.charges.find((charge) => charge.id === noah!.id);
    expect(paid?.status).toBe("paypal_created");
    expect(paid?.paypal?.mode).toBe("mock");
    expect(paid?.paypal?.id.startsWith("MOCK-ORDER-")).toBe(true);
    expect(paid?.paypal?.disclaimer).toBe(MOCK_ORDER_DISCLAIMER);
    expect(paid?.paypal?.approveUrl ?? "").not.toContain("paypal.com");
    const stillWaiting = created.group.charges.find((charge) => charge.id === elena!.id);
    expect(stillWaiting?.status).toBe("proposed");
    expect(stillWaiting?.paypal).toBeNull();
  });

  it("settles only through a labelled mock webhook and ignores a second delivery", async () => {
    const store = createMemoryStore();
    const paypal = fakePayPal();
    const group = await cabin(store);
    const noah = group.charges.find((charge) => charge.from === "Noah")!;
    setStoreForTests(store);
    await approveRoute(
      new Request("http://localhost/approve", { method: "POST", body: JSON.stringify({ actor: "Noah" }) }),
      { params: Promise.resolve({ id: group.id, chargeId: noah.id }) },
    );
    await paypalRoute(
      new Request("http://localhost/paypal", {
        method: "POST",
        body: JSON.stringify({ actor: "Noah", kind: "order" }),
      }),
      { params: Promise.resolve({ id: group.id, chargeId: noah.id }) },
    );

    const event = {
      id: "MOCK-EVT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      mock: true,
      resource: {
        custom_id: noah.id,
        supplementary_data: { related_ids: { order_id: `MOCK-ORDER-${noah.id}` } },
      },
    };
    const missingHeader = await webhookRoute(
      new Request("http://localhost/webhook", { method: "POST", body: JSON.stringify(event) }),
    );
    expect(missingHeader.status).toBe(400);

    const accepted = await webhookRoute(
      new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-split-steward-mock": "1" },
        body: JSON.stringify(event),
      }),
    );
    expect(accepted.status).toBe(200);
    const saved = await store.getGroup(group.id);
    expect(saved?.charges.find((charge) => charge.id === noah.id)?.status).toBe("settled");
    expect(saved?.charges.find((charge) => charge.id === noah.id)?.events.at(-1)?.detail).toContain(
      "PayPal was not called",
    );

    const duplicate = await applyWebhook({
      store,
      paypal: paypal.client,
      event,
      headers: { "x-split-steward-mock": "1" },
    });
    expect(duplicate.duplicate).toBe(true);
  });

  it("does not settle a charge that never passed the gate", async () => {
    const store = createMemoryStore();
    const group = await cabin(store);
    const noah = group.charges.find((charge) => charge.from === "Noah")!;
    const result = await applyWebhook({
      store,
      event: {
        id: "MOCK-EVT-early",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        mock: true,
        resource: { custom_id: noah.id },
      },
      headers: { "x-split-steward-mock": "1" },
    });
    expect(result.ignored).toBe(true);
    expect((await store.getGroup(group.id))?.charges.find((charge) => charge.id === noah.id)?.status).toBe(
      "proposed",
    );
  });

  it("requires an email for an invoice and keeps the charge approved if PayPal is not configured", async () => {
    const store = createMemoryStore();
    const paypal = fakePayPal();
    const group = await cabin(store);
    const noah = group.charges.find((charge) => charge.from === "Noah")!;
    setStoreForTests(store);
    await approveRoute(
      new Request("http://localhost/approve", { method: "POST", body: JSON.stringify({ actor: "Noah" }) }),
      { params: Promise.resolve({ id: group.id, chargeId: noah.id }) },
    );
    await expect(
      createPayPalCharge({
        store,
        paypal: paypal.client,
        groupId: group.id,
        chargeId: noah.id,
        actor: "Noah",
        kind: "invoice",
        appUrl: "http://127.0.0.1:3000",
      }),
    ).rejects.toMatchObject({ code: "EMAIL_REQUIRED" });
    expect(paypal.calls).toEqual([]);

    const invoiced = await createPayPalCharge({
      store,
      paypal: paypal.client,
      groupId: group.id,
      chargeId: noah.id,
      actor: "Noah",
      kind: "invoice",
      recipientEmail: "noah@example.com",
      appUrl: "http://127.0.0.1:3000",
    });
    const charge = invoiced.charges.find((item) => item.id === noah.id);
    expect(charge?.paypal?.disclaimer).toBe(MOCK_INVOICE_DISCLAIMER);
    expect(paypal.calls).toEqual(["invoice:noah@example.com"]);

    process.env.PAYPAL_MODE = "sandbox";
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    const elena = group.charges.find((item) => item.from === "Elena")!;
    await approveRoute(
      new Request("http://localhost/approve", { method: "POST", body: JSON.stringify({ actor: "Elena" }) }),
      { params: Promise.resolve({ id: group.id, chargeId: elena.id }) },
    );
    await expect(
      createPayPalCharge({
        store,
        groupId: group.id,
        chargeId: elena.id,
        actor: "Elena",
        kind: "order",
        appUrl: "http://127.0.0.1:3000",
      }),
    ).rejects.toBeInstanceOf(AppError);
    const after = await store.getGroup(group.id);
    expect(after?.charges.find((item) => item.id === elena.id)?.status).toBe("approved");
    expect(after?.charges.find((item) => item.id === elena.id)?.paypal).toBeNull();
  });

  it("uses the mock parser when asked, even if gateway mode is configured", async () => {
    process.env.AI_MODE = "gateway";
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const fetchSpy = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network should stay unused");
    };
    try {
      const group = await proposeGroup({
        store: createMemoryStore(),
        text: samples[0]!.text,
        forceMock: true,
      });
      expect(group.proposal.ai.mode).toBe("mock");
      expect(group.proposal.ai.disclaimer).toContain("No language model was called");
      expect(group.charges).toHaveLength(2);
    } finally {
      globalThis.fetch = fetchSpy;
    }
  });

  it("leaves a rejected charge unpaid", async () => {
    const store = createMemoryStore();
    const paypal = fakePayPal();
    const group = await cabin(store);
    const elena = group.charges.find((charge) => charge.from === "Elena")!;
    await rejectGroupCharge({ store, groupId: group.id, chargeId: elena.id, actor: "Elena", reason: "Paid cash" });
    await expect(
      createPayPalCharge({
        store,
        paypal: paypal.client,
        groupId: group.id,
        chargeId: elena.id,
        actor: "Elena",
        kind: "order",
        appUrl: "http://127.0.0.1:3000",
      }),
    ).rejects.toMatchObject({ code: "REJECTED" });
    expect(paypal.calls).toEqual([]);
  });
});

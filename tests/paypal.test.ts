import { afterEach, describe, expect, it } from "vitest";
import { buildInvoiceBody, buildOrderBody, createSandboxPayPalClient, resetPayPalTokenCache } from "@/lib/paypal";
import type { PayPalCreateInput } from "@/lib/types";

const envSnapshot = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
  resetPayPalTokenCache();
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

const input: PayPalCreateInput = {
  groupId: "grp_1",
  chargeId: "chg_1",
  from: "Noah",
  to: "Priya",
  amountCents: 9713,
  description: "Cabin weekend: Noah pays Priya",
  appUrl: "http://127.0.0.1:3000",
};

describe("PayPal sandbox request shapes", () => {
  it("builds an order body in cents-as-dollars with sandbox return URLs", () => {
    const body = buildOrderBody(input);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]?.amount).toEqual({ currency_code: "USD", value: "97.13" });
    expect(body.purchase_units[0]?.custom_id).toBe("chg_1");
    expect(body.application_context.return_url).toBe("http://127.0.0.1:3000/settlements/grp_1?paypal=return");
    expect(JSON.stringify(body)).not.toContain("api-m.paypal.com");
  });

  it("builds an invoice for the debtor's email", () => {
    const body = buildInvoiceBody({ ...input, recipientEmail: "noah@example.com" });
    expect(body.primary_recipients[0]?.billing_info.email_address).toBe("noah@example.com");
    expect(body.items[0]?.unit_amount.value).toBe("97.13");
    expect(body.detail.currency_code).toBe("USD");
  });

  it("sends the order to the sandbox host and keeps the secret out of the order body", async () => {
    process.env.PAYPAL_CLIENT_ID = "test-client";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    const calls: Array<{ url: string; body: string; authorization: string }> = [];
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = new Headers(init?.headers);
      calls.push({ url: href, body, authorization: headers.get("authorization") ?? "" });
      if (href.endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "sandbox-token", expires_in: 300 });
      }
      return Response.json({
        id: "ORDER-123",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123" }],
      });
    };

    const created = await createSandboxPayPalClient().createOrder(input);
    expect(created.mode).toBe("sandbox");
    expect(created.id).toBe("ORDER-123");
    expect(created.approveUrl).toContain("sandbox.paypal.com");
    expect(created.disclaimer).toContain("not a live payment");
    expect(calls[0]?.url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(calls[1]?.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(calls[1]?.authorization).toBe("Bearer sandbox-token");
    expect(calls[1]?.body).not.toContain("test-secret");
    expect(calls[1]?.body).toContain("97.13");
    expect(calls.every((call) => call.url.startsWith("https://api-m.sandbox.paypal.com"))).toBe(true);
  });

  it("verifies webhook signatures through the sandbox notifications API", async () => {
    process.env.PAYPAL_CLIENT_ID = "test-client";
    process.env.PAYPAL_CLIENT_SECRET = "test-secret";
    process.env.PAYPAL_WEBHOOK_ID = "WH-123";
    let verifyBody = "";
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.endsWith("/v1/oauth2/token")) {
        return Response.json({ access_token: "sandbox-token", expires_in: 300 });
      }
      verifyBody = String(init?.body ?? "");
      return Response.json({ verification_status: "SUCCESS" });
    };
    const ok = await createSandboxPayPalClient().verifyWebhook({
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
        "paypal-transmission-id": "tid",
        "paypal-transmission-sig": "sig",
        "paypal-transmission-time": "2026-11-04T00:00:00Z",
      },
      event: { id: "WH-EVT", event_type: "PAYMENT.CAPTURE.COMPLETED" },
    });
    expect(ok).toBe(true);
    expect(verifyBody).toContain("WH-123");
    expect(verifyBody).toContain("PAYMENT.CAPTURE.COMPLETED");
    expect(verifyBody).not.toContain("test-secret");
  });
});

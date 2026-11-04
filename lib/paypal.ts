import { appUrl, PAYPAL_API_BASE, paypalMode } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { centsToDollars } from "@/lib/money";
import type { IncomingWebhook, PayPalCreateInput, PayPalMode, PayPalRecord } from "@/lib/types";

export const MOCK_ORDER_DISCLAIMER = "Simulated PayPal order. The PayPal API was not called.";
export const MOCK_INVOICE_DISCLAIMER = "Simulated PayPal invoice. The PayPal API was not called.";
export const SANDBOX_ORDER_DISCLAIMER = "PayPal sandbox order. This is not a live payment.";
export const SANDBOX_INVOICE_DISCLAIMER = "PayPal sandbox invoice. This is not a live payment.";

export type PayPalClient = {
  mode: PayPalMode;
  createOrder(input: PayPalCreateInput): Promise<PayPalRecord>;
  createInvoice(input: PayPalCreateInput & { recipientEmail: string }): Promise<PayPalRecord>;
  captureOrder(orderId: string): Promise<{ status: string; captureId: string | null }>;
  verifyWebhook(args: { headers: Record<string, string>; event: IncomingWebhook }): Promise<boolean>;
};

type PayPalLink = { href?: string; rel?: string };

export function buildOrderBody(input: PayPalCreateInput) {
  return {
    intent: "CAPTURE" as const,
    purchase_units: [
      {
        reference_id: input.chargeId.slice(0, 256),
        custom_id: input.chargeId.slice(0, 127),
        description: input.description.slice(0, 127),
        amount: { currency_code: "USD" as const, value: centsToDollars(input.amountCents) },
      },
    ],
    application_context: {
      brand_name: "Split Steward",
      shipping_preference: "NO_SHIPPING" as const,
      user_action: "PAY_NOW" as const,
      return_url: `${input.appUrl}/settlements/${input.groupId}?paypal=return`,
      cancel_url: `${input.appUrl}/settlements/${input.groupId}?paypal=cancel`,
    },
  };
}

export function buildInvoiceBody(input: PayPalCreateInput & { recipientEmail: string }) {
  return {
    detail: {
      currency_code: "USD" as const,
      note: "Split Steward sandbox invoice. No live money moves.",
      memo: input.description.slice(0, 500),
      payment_term: { term_type: "DUE_ON_RECEIPT" as const },
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: input.from.slice(0, 140) },
          email_address: input.recipientEmail,
        },
      },
    ],
    items: [
      {
        name: `Reimburse ${input.to}`.slice(0, 200),
        description: input.description.slice(0, 1000),
        quantity: "1",
        unit_amount: { currency_code: "USD" as const, value: centsToDollars(input.amountCents) },
      },
    ],
  };
}

export function createMockPayPalClient(): PayPalClient {
  return {
    mode: "mock",
    async createOrder(input) {
      const id = `MOCK-ORDER-${input.chargeId}`;
      return {
        mode: "mock",
        kind: "order",
        id,
        status: "CREATED",
        approveUrl: `/mock/checkout/${encodeURIComponent(id)}`,
        disclaimer: MOCK_ORDER_DISCLAIMER,
      };
    },
    async createInvoice(input) {
      return {
        mode: "mock",
        kind: "invoice",
        id: `MOCK-INVOICE-${input.chargeId}`,
        status: "SENT",
        approveUrl: null,
        disclaimer: MOCK_INVOICE_DISCLAIMER,
      };
    },
    async captureOrder() {
      throw new AppError(
        "Simulated orders settle through the mock checkout, not a capture call.",
        "MOCK_CAPTURE",
        400,
      );
    },
    async verifyWebhook({ headers, event }) {
      return event.mock === true && headers["x-split-steward-mock"] === "1";
    },
  };
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function resetPayPalTokenCache(): void {
  tokenCache = null;
}

function requireSandboxCredentials(): { id: string; secret: string } {
  const id = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  if (!id || !secret) {
    throw new AppError(
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for sandbox mode.",
      "PAYPAL_NOT_CONFIGURED",
      500,
    );
  }
  return { id, secret };
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const { id, secret } = requireSandboxCredentials();
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new AppError(data.message || "PayPal sandbox login failed.", "PAYPAL_AUTH", 502);
  }
  const expiresIn = Number(data.expires_in ?? 300);
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
  };
  return data.access_token;
}

async function paypalFetch(path: string, init: { method?: string; json?: unknown; requestId?: string } = {}) {
  assertSandboxBase();
  const token = await accessToken();
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.requestId) headers.set("PayPal-Request-Id", init.requestId);
  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const response = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method: init.method ?? "POST",
    headers,
    body,
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const details = data.details as Array<{ description?: string }> | undefined;
    const message =
      details?.[0]?.description ||
      (typeof data.message === "string" ? data.message : "") ||
      `PayPal request failed (${response.status}).`;
    throw new AppError(message, "PAYPAL_HTTP", 502);
  }
  return data;
}

function assertSandboxBase(): void {
  if (PAYPAL_API_BASE !== "https://api-m.sandbox.paypal.com") {
    throw new AppError("Refusing to call a non-sandbox PayPal host.", "PAYPAL_HOST", 500);
  }
}

function link(data: Record<string, unknown>, rel: string): string | null {
  const links = data.links as PayPalLink[] | undefined;
  return links?.find((item) => item.rel === rel)?.href ?? null;
}

export function createSandboxPayPalClient(): PayPalClient {
  return {
    mode: "sandbox",
    async createOrder(input) {
      const data = await paypalFetch("/v2/checkout/orders", {
        json: buildOrderBody(input),
        requestId: `order-${input.chargeId}`,
      });
      const id = String(data.id ?? "");
      if (!id) throw new AppError("PayPal did not return an order id.", "PAYPAL_HTTP", 502);
      return {
        mode: "sandbox",
        kind: "order",
        id,
        status: String(data.status ?? "CREATED"),
        approveUrl: link(data, "approve"),
        disclaimer: SANDBOX_ORDER_DISCLAIMER,
      };
    },
    async createInvoice(input) {
      const created = await paypalFetch("/v2/invoicing/invoices", {
        json: buildInvoiceBody(input),
        requestId: `invoice-${input.chargeId}`,
      });
      const id = String(created.id ?? "");
      if (!id) throw new AppError("PayPal did not return an invoice id.", "PAYPAL_HTTP", 502);
      const sent = await paypalFetch(`/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, {
        json: { send_to_recipient: true, send_to_invoicer: false },
      });
      return {
        mode: "sandbox",
        kind: "invoice",
        id,
        status: "SENT",
        approveUrl: link(sent, "payer-view") ?? link(created, "self"),
        disclaimer: SANDBOX_INVOICE_DISCLAIMER,
      };
    },
    async captureOrder(orderId) {
      const data = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        json: {},
      });
      const units = data.purchase_units as
        | Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }>
        | undefined;
      const capture = units?.[0]?.payments?.captures?.[0];
      return {
        status: String(data.status ?? capture?.status ?? ""),
        captureId: capture?.id ?? null,
      };
    },
    async verifyWebhook({ headers, event }) {
      const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
      if (!webhookId) {
        throw new AppError(
          "PAYPAL_WEBHOOK_ID is required to verify sandbox webhooks.",
          "PAYPAL_NOT_CONFIGURED",
          500,
        );
      }
      const transmissionId = headers["paypal-transmission-id"];
      const transmissionSig = headers["paypal-transmission-sig"];
      const transmissionTime = headers["paypal-transmission-time"];
      const certUrl = headers["paypal-cert-url"];
      const authAlgo = headers["paypal-auth-algo"];
      if (!transmissionId || !transmissionSig || !transmissionTime || !certUrl || !authAlgo) {
        return false;
      }
      const data = await paypalFetch("/v1/notifications/verify-webhook-signature", {
        json: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        },
      });
      return data.verification_status === "SUCCESS";
    },
  };
}

export function getPayPalClient(): PayPalClient {
  return paypalMode() === "sandbox" ? createSandboxPayPalClient() : createMockPayPalClient();
}

export function headerMap(headers: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
  } else {
    for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  }
  return out;
}

export function defaultAppUrl(): string {
  return appUrl();
}

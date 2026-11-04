import type { AiMode, PayPalMode } from "@/lib/types";

export const DEFAULT_MODEL = "openai/gpt-5.4-mini";
export const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

function read(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function paypalMode(): PayPalMode {
  const explicit = read("PAYPAL_MODE").toLowerCase();
  if (explicit === "mock" || explicit === "sandbox") return explicit;
  if (explicit) {
    throw new Error(`PAYPAL_MODE must be "mock" or "sandbox" (got "${explicit}").`);
  }
  if (read("PAYPAL_CLIENT_ID") && read("PAYPAL_CLIENT_SECRET")) return "sandbox";
  return "mock";
}

export function aiMode(): AiMode {
  const explicit = read("AI_MODE").toLowerCase();
  if (explicit === "mock" || explicit === "gateway") return explicit;
  if (explicit) {
    throw new Error(`AI_MODE must be "mock" or "gateway" (got "${explicit}").`);
  }
  if (read("AI_GATEWAY_API_KEY")) return "gateway";
  return "mock";
}

export function aiModel(): string {
  return read("AI_MODEL") || DEFAULT_MODEL;
}

export function appUrl(): string {
  return (read("APP_URL") || read("NEXT_PUBLIC_APP_URL") || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function bannerCopy(paypal: PayPalMode, ai: AiMode, model: string | null): string {
  if (paypal === "mock" && ai === "mock") {
    return "Mock mode. PayPal was not called, and no language model was called. Amounts labelled simulated are not PayPal results.";
  }
  if (paypal === "mock") {
    return `PayPal mock mode. PayPal was not called. The narrative came from ${model ?? "the AI Gateway"}. Settlement math is deterministic, and simulated amounts are not PayPal results.`;
  }
  if (ai === "mock") {
    return "PayPal sandbox. Orders and invoices are sandbox objects, not live charges. The note was read by the local heuristic parser, not a language model.";
  }
  return `PayPal sandbox. Orders and invoices are sandbox objects, not live charges. The model is ${model ?? "the configured gateway model"} via the AI Gateway. A person must approve before any PayPal call.`;
}

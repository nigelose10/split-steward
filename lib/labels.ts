import type { Charge, PayPalMode } from "@/lib/types";

export function chargeStatusLabel(charge: Charge): string {
  switch (charge.status) {
    case "proposed":
      return "Proposed — waiting for approval";
    case "approved":
      return "Approved — PayPal not called yet";
    case "rejected":
      return "Rejected";
    case "paypal_created":
      return charge.paypal?.mode === "sandbox"
        ? "PayPal sandbox object created"
        : "Simulated PayPal object created";
    case "settled":
      if (!charge.paypal) return "Settled";
      return charge.paypal.mode === "sandbox"
        ? "Settled in PayPal sandbox"
        : "Settled in simulation";
  }
}

export function createOrderLabel(mode: PayPalMode): string {
  return mode === "sandbox" ? "Create PayPal sandbox order" : "Create simulated PayPal order";
}

export function createInvoiceLabel(mode: PayPalMode): string {
  return mode === "sandbox" ? "Send PayPal sandbox invoice" : "Create simulated PayPal invoice";
}

export function checkoutLabel(mode: PayPalMode): string {
  return mode === "sandbox" ? "Open PayPal sandbox checkout" : "Open simulated checkout";
}

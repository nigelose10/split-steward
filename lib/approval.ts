import { AppError } from "@/lib/errors";
import type { Charge, PayPalRecord } from "@/lib/types";

export function approveCharge(charge: Charge, actor: string, now: string): Charge {
  const name = actor.trim();
  if (charge.status !== "proposed") {
    throw new AppError(
      `This charge is ${charge.status} and can no longer be approved.`,
      "NOT_PROPOSED",
      409,
    );
  }
  if (name !== charge.from) {
    throw new AppError(`Only ${charge.from} can approve this payment.`, "WRONG_APPROVER", 403);
  }
  return {
    ...charge,
    status: "approved",
    approval: { approver: name, approvedAt: now },
    events: [
      ...charge.events,
      {
        at: now,
        type: "approved",
        detail: `${name} approved. PayPal has not been called.`,
      },
    ],
  };
}

export function rejectCharge(charge: Charge, actor: string, reason: string, now: string): Charge {
  const name = actor.trim();
  if (charge.status !== "proposed") {
    throw new AppError(
      `This charge is ${charge.status} and can no longer be rejected.`,
      "NOT_PROPOSED",
      409,
    );
  }
  if (name !== charge.from) {
    throw new AppError(`Only ${charge.from} can reject this payment.`, "WRONG_APPROVER", 403);
  }
  const cleanReason = reason.trim() || "No reason given.";
  return {
    ...charge,
    status: "rejected",
    rejection: { rejector: name, rejectedAt: now, reason: cleanReason },
    events: [
      ...charge.events,
      { at: now, type: "rejected", detail: `${name} rejected: ${cleanReason}` },
    ],
  };
}

/**
 * PayPal (or the mock stand-in) may run only after the debtor has approved.
 * Call this immediately before any PayPal HTTP request.
 */
export function assertReadyForPayPal(charge: Charge): void {
  if (charge.amountCents <= 0) {
    throw new AppError("Amount must be positive.", "ZERO_AMOUNT", 400);
  }
  if (charge.status === "rejected" || charge.rejection) {
    throw new AppError("A rejected charge cannot be sent to PayPal.", "REJECTED", 409);
  }
  if (charge.status !== "approved" || !charge.approval) {
    throw new AppError(
      "A person must approve this charge before PayPal is called.",
      "APPROVAL_REQUIRED",
      409,
    );
  }
  if (charge.approval.approver !== charge.from) {
    throw new AppError("The recorded approval is not from the payer.", "APPROVAL_REQUIRED", 409);
  }
  if (charge.paypal) {
    throw new AppError("PayPal was already created for this charge.", "ALREADY_HAS_PAYPAL", 409);
  }
}

export function markPayPalCreated(charge: Charge, paypal: PayPalRecord, now: string): Charge {
  assertReadyForPayPal(charge);
  if (!paypal.disclaimer.trim()) {
    throw new AppError("A PayPal record needs a disclaimer.", "PAYPAL_LABEL", 500);
  }
  return {
    ...charge,
    status: "paypal_created",
    paypal,
    events: [
      ...charge.events,
      { at: now, type: "paypal_created", detail: paypal.disclaimer },
    ],
  };
}

export function markSettled(charge: Charge, detail: string, now: string): Charge {
  if (charge.status === "settled") return charge;
  if (charge.status !== "paypal_created" || !charge.paypal) {
    throw new AppError(
      "A charge can be marked settled only after a PayPal order or invoice exists.",
      "NOT_PAYPAL_CREATED",
      409,
    );
  }
  return {
    ...charge,
    status: "settled",
    paypal: { ...charge.paypal, status: "SETTLED" },
    events: [...charge.events, { at: now, type: "settled", detail }],
  };
}

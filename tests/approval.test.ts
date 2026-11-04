import { describe, expect, it } from "vitest";
import {
  approveCharge,
  assertReadyForPayPal,
  markPayPalCreated,
  markSettled,
  rejectCharge,
} from "@/lib/approval";
import { AppError } from "@/lib/errors";
import { MOCK_ORDER_DISCLAIMER } from "@/lib/paypal";
import type { Charge, PayPalRecord } from "@/lib/types";

const now = "2026-11-04T15:00:00.000Z";

function proposed(): Charge {
  return {
    id: "chg_test",
    from: "Noah",
    to: "Priya",
    amountCents: 9713,
    currency: "USD",
    status: "proposed",
    approval: null,
    rejection: null,
    paypal: null,
    events: [],
  };
}

const mockRecord: PayPalRecord = {
  mode: "mock",
  kind: "order",
  id: "MOCK-ORDER-chg_test",
  status: "CREATED",
  approveUrl: "/mock/checkout/MOCK-ORDER-chg_test",
  disclaimer: MOCK_ORDER_DISCLAIMER,
};

describe("approval gate", () => {
  it("rejects an approval from anyone but the debtor", () => {
    expect(() => approveCharge(proposed(), "Priya", now)).toThrow(AppError);
    try {
      approveCharge(proposed(), "Priya", now);
    } catch (error) {
      expect(error).toMatchObject({ code: "WRONG_APPROVER" });
    }
  });

  it("records the debtor and does not attach a PayPal record", () => {
    const approved = approveCharge(proposed(), "Noah", now);
    expect(approved.status).toBe("approved");
    expect(approved.approval).toEqual({ approver: "Noah", approvedAt: now });
    expect(approved.paypal).toBeNull();
    expect(approved.events.at(-1)?.detail).toContain("PayPal has not been called");
  });

  it("refuses PayPal before approval and allows it after", () => {
    expect(() => assertReadyForPayPal(proposed())).toThrow(AppError);
    try {
      assertReadyForPayPal(proposed());
    } catch (error) {
      expect(error).toMatchObject({ code: "APPROVAL_REQUIRED" });
    }
    const approved = approveCharge(proposed(), "Noah", now);
    expect(() => assertReadyForPayPal(approved)).not.toThrow();
  });

  it("refuses a tampered approval that was not made by the debtor", () => {
    const tampered: Charge = {
      ...proposed(),
      status: "approved",
      approval: { approver: "Priya", approvedAt: now },
    };
    expect(() => assertReadyForPayPal(tampered)).toThrow(AppError);
  });

  it("blocks a rejected charge from ever reaching PayPal", () => {
    const rejected = rejectCharge(proposed(), "Noah", "I already paid cash", now);
    expect(rejected.status).toBe("rejected");
    expect(() => approveCharge(rejected, "Noah", now)).toThrow(AppError);
    expect(() => assertReadyForPayPal(rejected)).toThrow(AppError);
    try {
      assertReadyForPayPal(rejected);
    } catch (error) {
      expect(error).toMatchObject({ code: "REJECTED" });
    }
  });

  it("will not mark a charge settled until a PayPal record exists", () => {
    const approved = approveCharge(proposed(), "Noah", now);
    expect(() => markSettled(approved, "too early", now)).toThrow(AppError);
    try {
      markSettled(approved, "too early", now);
    } catch (error) {
      expect(error).toMatchObject({ code: "NOT_PAYPAL_CREATED" });
    }
    const created = markPayPalCreated(approved, mockRecord, now);
    expect(created.status).toBe("paypal_created");
    expect(created.events.at(-1)?.detail).toBe(MOCK_ORDER_DISCLAIMER);
    const settled = markSettled(created, "Settled by a simulated webhook.", now);
    expect(settled.status).toBe("settled");
    expect(markSettled(settled, "again", now)).toBe(settled);
  });
});

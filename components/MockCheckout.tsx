"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { Charge, Group } from "@/lib/types";

export function MockCheckout({ group, charge }: { group: Group; charge: Charge }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const paypal = charge.paypal;

  async function simulate() {
    if (!paypal) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/paypal/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-split-steward-mock": "1",
        },
        body: JSON.stringify({
          id: `MOCK-EVT-${crypto.randomUUID()}`,
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          mock: true,
          resource: {
            id: `MOCK-CAP-${charge.id}`,
            custom_id: charge.id,
            status: "COMPLETED",
            supplementary_data: { related_ids: { order_id: paypal.id } },
          },
        }),
      });
      const json = (await response.json()) as { error?: { message?: string }; status?: string };
      if (!response.ok) {
        setMessage(json.error?.message ?? "The simulation did not update the charge.");
        return;
      }
      setMessage(
        "Simulated webhook accepted. PayPal was not called. The settlement should now say it was settled in simulation.",
      );
    } catch {
      setMessage("The simulation request did not finish.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="checkout card" data-testid="mock-checkout">
      <span className="stamp">Simulation · not PayPal</span>
      <h2>Simulated checkout</h2>
      <p>
        This page is not PayPal. No sandbox API was called, and no payment is processed. It only posts a labelled mock webhook back into Split Steward.
      </p>
      <p className="money" data-testid="mock-amount">
        {formatMoney(charge.amountCents)}
      </p>
      <p>
        {charge.from} would pay {charge.to} for “{group.title}”.
      </p>
      {paypal ? <p className="disclaimer">{paypal.disclaimer}</p> : null}
      {charge.status === "settled" ? (
        <p data-testid="sim-result">This simulated charge is already settled.</p>
      ) : (
        <button className="button" type="button" data-testid="simulate-pay" disabled={pending} onClick={() => void simulate()}>
          {pending ? "Sending simulated webhook…" : "Simulate buyer approval"}
        </button>
      )}
      {message ? (
        <p className="callout mock" role="status" data-testid="sim-result">
          {message}
        </p>
      ) : null}
      <p>
        <a href={`/settlements/${group.id}`}>Back to the settlement</a>
      </p>
    </section>
  );
}

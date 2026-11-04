"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkoutLabel, chargeStatusLabel, createInvoiceLabel, createOrderLabel } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import type { AiMode, Group, PayPalMode } from "@/lib/types";

const ExpenseGrid = dynamic(() => import("@/components/LedgerGrid").then((mod) => mod.ExpenseGrid), {
  ssr: false,
  loading: () => <p className="quiet">Loading the expense grid…</p>,
});

const ChargeGrid = dynamic(() => import("@/components/LedgerGrid").then((mod) => mod.ChargeGrid), {
  ssr: false,
  loading: () => <p className="quiet">Loading the ledger…</p>,
});

export function SettlementView({
  initial,
  paypalMode,
  aiMode,
}: {
  initial: Group;
  paypalMode: PayPalMode;
  aiMode: AiMode;
}) {
  const [group, setGroup] = useState(initial);
  const [actor, setActor] = useState(() => defaultActor(initial));
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>(initial.emails);
  const people = useMemo(() => group.proposal.balances.map((balance) => balance.name), [group]);
  const waiting = group.charges.some((charge) => charge.status === "paypal_created");
  const captureStarted = useRef(false);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setInterval(() => {
      void refresh(group.id, setGroup);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [waiting, group.id]);

  useEffect(() => {
    if (captureStarted.current) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypal") !== "return") return undefined;
    const token = params.get("token");
    const charge = group.charges.find((item) => item.paypal?.id === token && item.paypal.mode === "sandbox");
    if (!charge || charge.status === "settled") return undefined;
    captureStarted.current = true;
    void post(`/api/groups/${group.id}/charges/${charge.id}/capture`, {}).then((next) => {
      if (next) setGroup(next);
    });
    return undefined;
  }, [group.id, group.charges]);

  async function act(chargeId: string, path: string, body: Record<string, unknown>) {
    setPendingId(chargeId);
    setError(null);
    const next = await post(`/api/groups/${group.id}/charges/${chargeId}/${path}`, body);
    setPendingId(null);
    if (!next) return;
    setGroup(next);
  }

  async function post(url: string, body: Record<string, unknown>): Promise<Group | null> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { group?: Group; error?: { message?: string } };
      if (!response.ok || !json.group) {
        setError(json.error?.message ?? "That action did not go through.");
        return null;
      }
      return json.group;
    } catch {
      setError("The request did not finish.");
      return null;
    }
  }

  const ai = group.proposal.ai;

  return (
    <div className="layout-split">
      <section className="card" style={{ padding: "1.1rem" }}>
        <p className="meta">
          {ai.mode === "mock" ? "Mock AI" : `AI Gateway · ${ai.model}`}
          {aiMode === "gateway" && ai.mode === "mock" ? " · forced mock parser" : ""}
          {" · "}
          {paypalMode === "mock" ? "PayPal simulation" : "PayPal sandbox"}
        </p>
        <h2>{group.title}</h2>
        <p className={`callout ${ai.mode}`} data-testid="ai-disclaimer">
          {ai.disclaimer}
        </p>
        <h3 className="section-title" style={{ marginTop: "1rem" }}>
          How the agent read it
        </h3>
        <p className="narrative" data-testid="narrative">
          {group.proposal.narrative}
        </p>
        <h3 className="section-title" style={{ marginTop: "1rem" }}>
          Why these amounts
        </h3>
        <p className="reasoning" data-testid="math-reasoning">
          {group.proposal.mathReasoning}
        </p>
        <ul className="assumptions">
          {group.proposal.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-title">Who is ahead</h2>
        <div className="balances">
          {group.proposal.balances.map((balance) => (
            <div
              key={balance.name}
              className={`balance ${balance.netCents > 0 ? "owed" : balance.netCents < 0 ? "owes" : ""}`}
              data-testid={`balance-${balance.name}`}
            >
              <span>{balance.name}</span>
              <b>
                {balance.netCents > 0
                  ? `is owed ${formatMoney(balance.netCents)}`
                  : balance.netCents < 0
                    ? `owes ${formatMoney(-balance.netCents)}`
                    : "is even"}
              </b>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Expenses</h2>
        <ExpenseGrid expenses={group.proposal.expenses} />
      </section>

      <section>
        <h2 className="section-title">Ledger</h2>
        <p className="quiet">AG Grid lists every proposed payment. Approval happens below it, one payer at a time.</p>
        {group.charges.length === 0 ? (
          <p>Nobody needs to pay anyone else.</p>
        ) : (
          <ChargeGrid charges={group.charges} />
        )}
      </section>

      <section className="identity card">
        <div>
          <label htmlFor="actor">You are acting as</label>
          <select
            id="actor"
            data-testid="actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
          >
            {people.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
        </div>
        <p className="quiet">
          The server accepts an approval only from the person who owes the money. Choosing a name here is the human gate for this demo. It is not an account login.
        </p>
      </section>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      <section className="charges">
        {group.charges.map((charge) => {
          const key = `${charge.from}-to-${charge.to}`;
          const mine = actor === charge.from;
          const busy = pendingId === charge.id;
          return (
            <article className="charge" key={charge.id} data-testid={`charge-${key}`}>
              <header>
                <h3>
                  {charge.from} pays {charge.to}
                </h3>
                <span className="money">{formatMoney(charge.amountCents)}</span>
              </header>
              <p data-testid={`status-${key}`}>{chargeStatusLabel(charge)}</p>
              {charge.status === "proposed" && mine ? (
                <div className="row">
                  <button
                    className="button"
                    type="button"
                    data-testid={`approve-${key}`}
                    disabled={busy}
                    onClick={() => void act(charge.id, "approve", { actor })}
                  >
                    Approve this payment
                  </button>
                  <input
                    type="text"
                    aria-label={`Reason for ${charge.from} to reject`}
                    placeholder="Reason if you reject"
                    value={rejectReason[charge.id] ?? ""}
                    onChange={(event) =>
                      setRejectReason((current) => ({ ...current, [charge.id]: event.target.value }))
                    }
                  />
                  <button
                    className="button danger"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(charge.id, "reject", { actor, reason: rejectReason[charge.id] ?? "" })
                    }
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {charge.status === "proposed" && !mine ? (
                <p className="quiet">Only {charge.from} can approve this payment.</p>
              ) : null}
              {charge.status === "approved" && mine ? (
                <div className="row">
                  <button
                    className="button"
                    type="button"
                    data-testid={`create-order-${key}`}
                    disabled={busy}
                    onClick={() => void act(charge.id, "paypal", { actor, kind: "order" })}
                  >
                    {createOrderLabel(paypalMode)}
                  </button>
                  <input
                    type="email"
                    aria-label={`Invoice email for ${charge.from}`}
                    placeholder={`${charge.from}'s email for an invoice`}
                    value={emails[charge.from] ?? ""}
                    onChange={(event) =>
                      setEmails((current) => ({ ...current, [charge.from]: event.target.value }))
                    }
                  />
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(charge.id, "paypal", {
                        actor,
                        kind: "invoice",
                        recipientEmail: emails[charge.from] ?? "",
                      })
                    }
                  >
                    {createInvoiceLabel(paypalMode)}
                  </button>
                </div>
              ) : null}
              {charge.paypal ? (
                <>
                  <p className="disclaimer" data-testid={`disclaimer-${key}`}>
                    {charge.paypal.disclaimer}
                  </p>
                  {charge.paypal.approveUrl ? (
                    <p>
                      <a
                        data-testid={`checkout-${key}`}
                        href={charge.paypal.approveUrl}
                        target={charge.paypal.mode === "sandbox" ? "_blank" : undefined}
                        rel="noreferrer"
                      >
                        {checkoutLabel(charge.paypal.mode)}
                      </a>
                    </p>
                  ) : null}
                </>
              ) : null}
              {charge.rejection ? (
                <p className="quiet">Rejected: {charge.rejection.reason}</p>
              ) : null}
              <ol className="events">
                {charge.events.map((event) => (
                  <li key={`${event.at}-${event.type}`}>
                    {event.detail}
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function defaultActor(group: Group): string {
  return group.charges.find((charge) => charge.status === "proposed")?.from ?? group.proposal.balances[0]?.name ?? "";
}

async function refresh(id: string, setGroup: (group: Group) => void) {
  const response = await fetch(`/api/groups/${id}`, { cache: "no-store" });
  if (!response.ok) return;
  const json = (await response.json()) as { group?: Group };
  if (json.group) setGroup(json.group);
}

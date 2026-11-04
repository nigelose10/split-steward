import { approveCharge, assertReadyForPayPal, markPayPalCreated, markSettled, rejectCharge } from "@/lib/approval";
import { aiMode } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { extractWithHeuristics } from "@/lib/mock-extract";
import { getPayPalClient, headerMap, type PayPalClient } from "@/lib/paypal";
import { settleExpenses } from "@/lib/split";
import type { Store } from "@/lib/store";
import type { Charge, Group, IncomingWebhook, PayPalKind, Proposal } from "@/lib/types";

const SETTLE_EVENTS = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "CHECKOUT.ORDER.COMPLETED",
  "INVOICING.INVOICE.PAID",
]);

const MOCK_NARRATIVE =
  "This reading used the local heuristic parser because no AI Gateway key is configured, or mock mode was requested. The payment amounts come from the deterministic splitter, not from a language model. PayPal has not been called.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function requireGroup(store: Store, groupId: string): Promise<Group> {
  const group = await store.getGroup(groupId);
  if (!group) throw new AppError("That settlement was not found.", "NOT_FOUND", 404);
  return group;
}

function requireCharge(group: Group, chargeId: string): Charge {
  const charge = group.charges.find((item) => item.id === chargeId);
  if (!charge) throw new AppError("That charge was not found.", "NOT_FOUND", 404);
  return charge;
}

function replaceCharge(group: Group, charge: Charge): Group {
  return {
    ...group,
    charges: group.charges.map((item) => (item.id === charge.id ? charge : item)),
  };
}

export async function proposeGroup(args: {
  store: Store;
  text: string;
  image?: { mediaType: string; base64: string } | null;
  forceMock?: boolean;
  now?: string;
}): Promise<Group> {
  const text = args.text.trim();
  const useMock = args.forceMock || aiMode() === "mock";
  if (!text && !args.image) {
    throw new AppError("Paste a note or attach a receipt photo.", "EMPTY", 400);
  }
  if (useMock && !text) {
    throw new AppError(
      "Mock mode cannot read receipt photos. Paste the receipt text, or set AI_GATEWAY_API_KEY.",
      "MOCK_AI_NO_VISION",
      400,
    );
  }

  const proposal = useMock ? proposeWithMock(text) : await proposeWithGateway(text, args.image);
  const createdAt = nowIso(args.now);
  const group: Group = {
    id: newId("grp"),
    createdAt,
    title: proposal.title,
    sourceText: text,
    proposal,
    emails: {},
    charges: proposal.transfers.map((transfer) => ({
      id: newId("chg"),
      from: transfer.from,
      to: transfer.to,
      amountCents: transfer.amountCents,
      currency: "USD" as const,
      status: "proposed" as const,
      approval: null,
      rejection: null,
      paypal: null,
      events: [
        {
          at: createdAt,
          type: "proposed",
          detail: "Waiting for the payer to approve before any PayPal call.",
        },
      ],
    })),
  };
  await args.store.saveGroup(group);
  return group;
}

function proposeWithMock(text: string): Proposal {
  const extracted = extractWithHeuristics(text);
  const math = settleExpenses(extracted.expenses);
  return {
    ...math,
    title: extracted.title,
    narrative: MOCK_NARRATIVE,
    assumptions: [
      "Mock parser: each expense names an amount like $12.34 and the people who share it.",
      "People listed on an expense split it equally, including the payer when they are listed.",
      "No language model was called.",
    ],
    ai: {
      mode: "mock",
      model: null,
      disclaimer: "Mock AI. A heuristic parser read this note. No language model was called.",
    },
  };
}

async function proposeWithGateway(
  text: string,
  image?: { mediaType: string; base64: string } | null,
): Promise<Proposal> {
  const { runGatewayAgent } = await import("@/lib/agent");
  return runGatewayAgent({ text, image });
}

export async function approveGroupCharge(args: {
  store: Store;
  groupId: string;
  chargeId: string;
  actor: string;
  now?: string;
}): Promise<Group> {
  const group = await requireGroup(args.store, args.groupId);
  const charge = requireCharge(group, args.chargeId);
  const next = replaceCharge(group, approveCharge(charge, args.actor, nowIso(args.now)));
  await args.store.saveGroup(next);
  return next;
}

export async function rejectGroupCharge(args: {
  store: Store;
  groupId: string;
  chargeId: string;
  actor: string;
  reason: string;
  now?: string;
}): Promise<Group> {
  const group = await requireGroup(args.store, args.groupId);
  const charge = requireCharge(group, args.chargeId);
  const next = replaceCharge(
    group,
    rejectCharge(charge, args.actor, args.reason, nowIso(args.now)),
  );
  await args.store.saveGroup(next);
  return next;
}

export async function createPayPalCharge(args: {
  store: Store;
  paypal?: PayPalClient;
  groupId: string;
  chargeId: string;
  actor: string;
  kind: PayPalKind;
  recipientEmail?: string;
  appUrl: string;
  now?: string;
}): Promise<Group> {
  const paypal = args.paypal ?? getPayPalClient();
  const group = await requireGroup(args.store, args.groupId);
  const charge = requireCharge(group, args.chargeId);
  if (charge.status === "paypal_created" || charge.status === "settled") return group;

  const actor = args.actor.trim();
  if (actor !== charge.from) {
    throw new AppError(`Only ${charge.from} can send this charge to PayPal.`, "WRONG_APPROVER", 403);
  }
  assertReadyForPayPal(charge);

  const description = `${group.title}: ${charge.from} pays ${charge.to}`;
  const base = {
    groupId: group.id,
    chargeId: charge.id,
    from: charge.from,
    to: charge.to,
    amountCents: charge.amountCents,
    description,
    appUrl: args.appUrl,
  };

  const record =
    args.kind === "invoice"
      ? await paypal.createInvoice({
          ...base,
          recipientEmail: requireEmail(args.recipientEmail, group.emails[charge.from]),
        })
      : await paypal.createOrder(base);

  const next = replaceCharge(group, markPayPalCreated(charge, record, nowIso(args.now)));
  if (args.recipientEmail?.trim()) {
    next.emails = { ...next.emails, [charge.from]: args.recipientEmail.trim() };
  }
  await args.store.saveGroup(next);
  return next;
}

function requireEmail(explicit: string | undefined, stored: string | undefined): string {
  const email = (explicit ?? stored ?? "").trim();
  if (!email) {
    throw new AppError(
      "An email address is required before a PayPal invoice can be created.",
      "EMAIL_REQUIRED",
      400,
    );
  }
  if (!EMAIL.test(email)) {
    throw new AppError(`“${email}” is not an email address.`, "BAD_EMAIL", 400);
  }
  return email;
}

export async function setGroupEmails(args: {
  store: Store;
  groupId: string;
  emails: Record<string, string>;
}): Promise<Group> {
  const group = await requireGroup(args.store, args.groupId);
  const emails = { ...group.emails };
  for (const [name, value] of Object.entries(args.emails)) {
    const email = value.trim();
    if (!email) {
      delete emails[name];
      continue;
    }
    if (!EMAIL.test(email)) {
      throw new AppError(`“${email}” is not an email address.`, "BAD_EMAIL", 400);
    }
    emails[name] = email;
  }
  const next = { ...group, emails };
  await args.store.saveGroup(next);
  return next;
}

export async function capturePayPalOrder(args: {
  store: Store;
  paypal?: PayPalClient;
  groupId: string;
  chargeId: string;
  now?: string;
}): Promise<Group> {
  const paypal = args.paypal ?? getPayPalClient();
  const group = await requireGroup(args.store, args.groupId);
  const charge = requireCharge(group, args.chargeId);
  if (charge.status === "settled") return group;
  if (charge.status !== "paypal_created" || !charge.paypal || charge.paypal.kind !== "order") {
    throw new AppError("There is no PayPal order to capture.", "NOT_PAYPAL_CREATED", 409);
  }
  if (charge.paypal.mode === "mock") {
    throw new AppError(
      "Simulated orders settle through the mock checkout, not a capture call.",
      "MOCK_CAPTURE",
      400,
    );
  }
  const capture = await paypal.captureOrder(charge.paypal.id);
  if (capture.status !== "COMPLETED") {
    const pending = replaceCharge(group, {
      ...charge,
      paypal: { ...charge.paypal, status: capture.status || charge.paypal.status },
      events: [
        ...charge.events,
        {
          at: nowIso(args.now),
          type: "capture_pending",
          detail: `PayPal capture status: ${capture.status || "unknown"}.`,
        },
      ],
    });
    await args.store.saveGroup(pending);
    return pending;
  }
  const detail = capture.captureId
    ? `PayPal sandbox capture ${capture.captureId} completed.`
    : "PayPal sandbox order capture completed.";
  const next = replaceCharge(group, markSettled(charge, detail, nowIso(args.now)));
  await args.store.saveGroup(next);
  return next;
}

export async function applyWebhook(args: {
  store: Store;
  paypal?: PayPalClient;
  event: IncomingWebhook;
  headers: Headers | Record<string, string>;
  now?: string;
}): Promise<{ duplicate?: boolean; ignored?: boolean; chargeId?: string; status?: string }> {
  const paypal = args.paypal ?? getPayPalClient();
  const headers = headerMap(args.headers);
  const eventId = args.event.id?.trim();
  if (!eventId || !args.event.event_type) {
    throw new AppError("Webhook event id and event_type are required.", "BAD_WEBHOOK", 400);
  }
  if (await args.store.hasEvent(eventId)) return { duplicate: true };

  const mockEvent = args.event.mock === true;
  if (paypal.mode === "mock") {
    if (!mockEvent || headers["x-split-steward-mock"] !== "1") {
      throw new AppError(
        "Mock mode only accepts simulated webhook events.",
        "MOCK_WEBHOOK_ONLY",
        400,
      );
    }
  } else if (mockEvent) {
    throw new AppError(
      "Refusing a simulated webhook while PayPal sandbox mode is on.",
      "MOCK_EVENT_IN_SANDBOX",
      400,
    );
  } else {
    const verified = await paypal.verifyWebhook({ headers, event: args.event });
    if (!verified) {
      throw new AppError("PayPal webhook signature verification failed.", "BAD_SIGNATURE", 401);
    }
  }

  const match = await findChargeForEvent(args.store, args.event);
  if (!match) {
    await args.store.recordEvent(eventId);
    return { ignored: true };
  }
  const { group, charge } = match;
  if (!charge.paypal) {
    await args.store.recordEvent(eventId);
    return { ignored: true, chargeId: charge.id };
  }
  if (mockEvent && charge.paypal.mode !== "mock") {
    throw new AppError("A simulated webhook cannot settle a sandbox charge.", "MODE_MISMATCH", 409);
  }
  if (!mockEvent && charge.paypal.mode !== "sandbox") {
    throw new AppError("A PayPal webhook cannot settle a simulated charge.", "MODE_MISMATCH", 409);
  }

  const now = nowIso(args.now);
  let updated = charge;

  if (
    args.event.event_type === "CHECKOUT.ORDER.APPROVED" &&
    charge.paypal.mode === "sandbox" &&
    charge.paypal.kind === "order" &&
    charge.status === "paypal_created"
  ) {
    const capture = await paypal.captureOrder(charge.paypal.id);
    if (capture.status === "COMPLETED") {
      updated = markSettled(
        charge,
        capture.captureId
          ? `PayPal sandbox capture ${capture.captureId} completed.`
          : "PayPal sandbox order approved and captured.",
        now,
      );
    }
  } else if (SETTLE_EVENTS.has(args.event.event_type) && charge.status !== "rejected") {
    const detail = mockEvent
      ? "Settled by a simulated webhook. PayPal was not called."
      : `Settled by PayPal sandbox event ${args.event.event_type}.`;
    updated = markSettled(charge, detail, now);
  }

  await args.store.saveGroup(replaceCharge(group, updated));
  await args.store.recordEvent(eventId);
  return { chargeId: updated.id, status: updated.status };
}

async function findChargeForEvent(
  store: Store,
  event: IncomingWebhook,
): Promise<{ group: Group; charge: Charge } | undefined> {
  const ids = new Set(candidateIds(event));
  if (ids.size === 0) return undefined;
  const groups = await store.listGroups();
  let fallback: { group: Group; charge: Charge } | undefined;
  for (const group of groups) {
    for (const charge of group.charges) {
      if (charge.paypal && ids.has(charge.paypal.id)) return { group, charge };
      if (ids.has(charge.id)) fallback = { group, charge };
    }
  }
  return fallback;
}

function candidateIds(event: IncomingWebhook): string[] {
  const resource = event.resource;
  if (!resource) return [];
  const ids = [resource.id, resource.custom_id, resource.invoice_id, resource.supplementary_data?.related_ids?.order_id];
  for (const unit of resource.purchase_units ?? []) {
    ids.push(unit.custom_id, unit.reference_id);
  }
  return ids.filter((id): id is string => Boolean(id));
}

export async function findByPayPalId(
  store: Store,
  paypalId: string,
): Promise<{ group: Group; charge: Charge } | undefined> {
  const groups = await store.listGroups();
  for (const group of groups) {
    const charge = group.charges.find((item) => item.paypal?.id === paypalId);
    if (charge) return { group, charge };
  }
  return undefined;
}

export type AiMode = "mock" | "gateway";
export type PayPalMode = "mock" | "sandbox";
export type PayPalKind = "order" | "invoice";

export type ChargeStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "paypal_created"
  | "settled";

export type Expense = {
  description: string;
  amountCents: number;
  payer: string;
  participants: string[];
  note?: string;
};

export type PersonBalance = {
  name: string;
  paidCents: number;
  shareCents: number;
  netCents: number;
};

export type Transfer = {
  from: string;
  to: string;
  amountCents: number;
};

export type SettlementMath = {
  expenses: Expense[];
  balances: PersonBalance[];
  transfers: Transfer[];
  mathReasoning: string;
};

export type Proposal = SettlementMath & {
  title: string;
  narrative: string;
  assumptions: string[];
  ai: {
    mode: AiMode;
    model: string | null;
    disclaimer: string;
  };
};

export type PayPalRecord = {
  mode: PayPalMode;
  kind: PayPalKind;
  id: string;
  status: string;
  approveUrl: string | null;
  disclaimer: string;
};

export type ChargeEvent = {
  at: string;
  type: string;
  detail: string;
};

export type Charge = {
  id: string;
  from: string;
  to: string;
  amountCents: number;
  currency: "USD";
  status: ChargeStatus;
  approval: null | { approver: string; approvedAt: string };
  rejection: null | { rejector: string; rejectedAt: string; reason: string };
  paypal: PayPalRecord | null;
  events: ChargeEvent[];
};

export type Group = {
  id: string;
  createdAt: string;
  title: string;
  sourceText: string;
  proposal: Proposal;
  charges: Charge[];
  emails: Record<string, string>;
};

export type PayPalCreateInput = {
  groupId: string;
  chargeId: string;
  from: string;
  to: string;
  amountCents: number;
  description: string;
  appUrl: string;
};

export type IncomingWebhook = {
  id?: string;
  event_type?: string;
  mock?: boolean;
  resource?: {
    id?: string;
    custom_id?: string;
    invoice_id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: Array<{ custom_id?: string; reference_id?: string }>;
  };
};

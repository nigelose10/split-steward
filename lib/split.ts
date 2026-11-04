import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import type { Expense, PersonBalance, SettlementMath, Transfer } from "@/lib/types";

const nameCollator = new Intl.Collator("en");

function compareNames(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

function rememberName(raw: string, registry: Map<string, string>): string {
  const display = raw.trim().replace(/\s+/g, " ");
  if (!display) {
    throw new AppError("A name is empty.", "BAD_NAME", 422);
  }
  const key = display.toLocaleLowerCase("en");
  const existing = registry.get(key);
  if (existing) return existing;
  registry.set(key, display);
  return display;
}

export function normalizeExpenses(expenses: Expense[]): Expense[] {
  if (expenses.length === 0) {
    throw new AppError("Add at least one expense.", "NO_EXPENSES", 422);
  }
  const registry = new Map<string, string>();
  return expenses.map((expense) => {
    if (!Number.isInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new AppError(
        `“${expense.description || "Expense"}” needs a positive cent amount.`,
        "BAD_AMOUNT",
        422,
      );
    }
    const payer = rememberName(expense.payer, registry);
    const participants: string[] = [];
    for (const participant of expense.participants) {
      const name = rememberName(participant, registry);
      if (!participants.includes(name)) participants.push(name);
    }
    if (participants.length === 0) {
      throw new AppError(
        `“${expense.description}” has nobody to split it with.`,
        "NO_PARTICIPANTS",
        422,
      );
    }
    const description = expense.description.trim();
    if (!description) {
      throw new AppError("An expense is missing a description.", "BAD_EXPENSE", 422);
    }
    return {
      description,
      amountCents: expense.amountCents,
      payer,
      participants,
      note: expense.note?.trim() || undefined,
    };
  });
}

/** Extra cents go one each to participants in English alphabetical order. */
export function allocateEqual(amountCents: number, participants: string[]): Map<string, number> {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new AppError("Split amounts must be whole cents.", "BAD_AMOUNT", 422);
  }
  if (participants.length === 0) {
    throw new AppError("Cannot split an expense across nobody.", "NO_PARTICIPANTS", 422);
  }
  const names = [...participants].sort(compareNames);
  const base = Math.floor(amountCents / names.length);
  let remainder = amountCents - base * names.length;
  const shares = new Map<string, number>();
  for (const name of names) {
    const extra = remainder > 0 ? 1 : 0;
    if (extra) remainder -= 1;
    shares.set(name, base + extra);
  }
  return shares;
}

export function explainSettlement(math: {
  expenses: Expense[];
  balances: PersonBalance[];
  transfers: Transfer[];
}): string {
  const lines: string[] = [];
  lines.push(
    "Each expense is split equally among the people named on it. The payer's own share stays with them, so they are reimbursed only for everyone else's share.",
  );
  lines.push(
    "When an amount does not divide evenly, the extra cents go one at a time to participants in alphabetical order.",
  );

  const everyone = new Set<string>();
  for (const expense of math.expenses) {
    everyone.add(expense.payer);
    for (const participant of expense.participants) everyone.add(participant);
  }

  for (const expense of math.expenses) {
    const leftOut = [...everyone].filter((name) => !expense.participants.includes(name)).sort(compareNames);
    if (leftOut.length > 0) {
      const verb = leftOut.length === 1 ? "is" : "are";
      lines.push(
        `${leftOut.join(" and ")} ${verb} not on “${expense.description}”, so that ${formatMoney(expense.amountCents)} stays among ${expense.participants.join(", ")}.`,
      );
    }
    const remainder = expense.amountCents % expense.participants.length;
    if (remainder > 0) {
      const winners = [...expense.participants].sort(compareNames).slice(0, remainder);
      const centWord = remainder === 1 ? "cent goes" : "cents go";
      lines.push(
        `“${expense.description}” does not divide evenly. ${remainder} extra ${centWord} to ${winners.join(", ")}.`,
      );
    }
  }

  for (const balance of [...math.balances].sort((a, b) => compareNames(a.name, b.name))) {
    const position =
      balance.netCents > 0
        ? `is owed ${formatMoney(balance.netCents)}`
        : balance.netCents < 0
          ? `owes ${formatMoney(-balance.netCents)}`
          : "is even";
    lines.push(
      `${balance.name} paid ${formatMoney(balance.paidCents)} and their fair share is ${formatMoney(balance.shareCents)}, so they ${position}.`,
    );
  }

  if (math.transfers.length === 0) {
    lines.push("Nobody needs to pay anyone else.");
  } else {
    lines.push("Settling those nets in the fewest payments:");
    for (const transfer of math.transfers) {
      lines.push(
        `${transfer.from} pays ${transfer.to} ${formatMoney(transfer.amountCents)}.`,
      );
    }
  }

  return lines.join("\n");
}

export function settleExpenses(input: Expense[]): SettlementMath {
  const expenses = normalizeExpenses(input);
  const names = new Set<string>();
  for (const expense of expenses) {
    names.add(expense.payer);
    for (const participant of expense.participants) names.add(participant);
  }

  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const name of names) {
    paid.set(name, 0);
    share.set(name, 0);
  }

  for (const expense of expenses) {
    paid.set(expense.payer, (paid.get(expense.payer) ?? 0) + expense.amountCents);
    const allocation = allocateEqual(expense.amountCents, expense.participants);
    for (const [name, cents] of allocation) {
      share.set(name, (share.get(name) ?? 0) + cents);
    }
  }

  const balances: PersonBalance[] = [...names]
    .sort(compareNames)
    .map((name) => {
      const paidCents = paid.get(name) ?? 0;
      const shareCents = share.get(name) ?? 0;
      return { name, paidCents, shareCents, netCents: paidCents - shareCents };
    });

  const totalPaid = balances.reduce((sum, balance) => sum + balance.paidCents, 0);
  const totalShare = balances.reduce((sum, balance) => sum + balance.shareCents, 0);
  const totalNet = balances.reduce((sum, balance) => sum + balance.netCents, 0);
  if (totalPaid !== totalShare || totalNet !== 0) {
    throw new AppError("The split did not balance.", "SPLIT_IMBALANCE", 500);
  }

  const transfers = minimizeTransfers(balances);
  const math = { expenses, balances, transfers, mathReasoning: "" };
  math.mathReasoning = explainSettlement(math);
  return math;
}

export function minimizeTransfers(balances: PersonBalance[]): Transfer[] {
  const creditors = balances
    .filter((balance) => balance.netCents > 0)
    .map((balance) => ({ name: balance.name, cents: balance.netCents }));
  const debtors = balances
    .filter((balance) => balance.netCents < 0)
    .map((balance) => ({ name: balance.name, cents: -balance.netCents }));
  const transfers: Transfer[] = [];
  const byAmount = (a: { name: string; cents: number }, b: { name: string; cents: number }) =>
    b.cents - a.cents || compareNames(a.name, b.name);

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const creditor = creditors[0];
    const debtor = debtors[0];
    if (!creditor || !debtor) break;
    const amountCents = Math.min(creditor.cents, debtor.cents);
    if (amountCents <= 0 || creditor.name === debtor.name) break;
    transfers.push({ from: debtor.name, to: creditor.name, amountCents });
    creditor.cents -= amountCents;
    debtor.cents -= amountCents;
    if (creditor.cents === 0) creditors.shift();
    if (debtor.cents === 0) debtors.shift();
  }

  if (creditors.some((party) => party.cents !== 0) || debtors.some((party) => party.cents !== 0)) {
    throw new AppError("Could not settle every balance.", "SPLIT_IMBALANCE", 500);
  }
  return transfers;
}

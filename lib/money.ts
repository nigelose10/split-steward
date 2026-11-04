import { AppError } from "@/lib/errors";

const MAX_CENTS = 1_000_000_00;

export function dollarsToCents(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)\.(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new AppError(
      `Amount "${value}" must look like 12.50.`,
      "BAD_AMOUNT",
      422,
    );
  }
  const cents = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) {
    throw new AppError(
      `Amount "${value}" is outside the supported range ($0.01 to $1,000,000.00).`,
      "BAD_AMOUNT",
      422,
    );
  }
  return cents;
}

export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole}.${frac}`;
}

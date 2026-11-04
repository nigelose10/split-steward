import { AppError } from "@/lib/errors";
import { dollarsToCents } from "@/lib/money";
import type { Expense } from "@/lib/types";

export const MOCK_FORMAT_HELP =
  "Mock parser examples: “Maya paid $86.40. Split equally between Maya, Jordan, and Sam.” or “Rent $300.00 paid by Priya — split equally between Priya, Noah, and Elena.” Set AI_GATEWAY_API_KEY for free-form notes and receipt photos.";

const NAME = "[A-Za-z][A-Za-z' -]*";

export type MockExtraction = {
  title: string;
  expenses: Expense[];
};

export function extractWithHeuristics(source: string): MockExtraction {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new AppError(`Paste a note first. ${MOCK_FORMAT_HELP}`, "EMPTY", 400);
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let title = "Shared expenses";
  let defaultPayer: string | undefined;
  const expenses: Expense[] = [];

  for (const line of lines) {
    const oneLine = line.match(
      new RegExp(`^(.+?)\\s+\\$(\\d+\\.\\d{2})\\s+paid by\\s+(${NAME}?)\\s+[—–-]\\s+(.+?)\\.?$`),
    );
    if (oneLine?.[1] && oneLine[2] && oneLine[3] && oneLine[4]) {
      expenses.push(
        toExpense(oneLine[1], oneLine[2], oneLine[3], parsePeople(oneLine[4])),
      );
      continue;
    }

    const item = line.match(new RegExp(`^(.+?)\\s+\\$(\\d+\\.\\d{2})\\s+[—–-]\\s+(.+?)\\.?$`));
    if (item?.[1] && item[2] && item[3]) {
      if (!defaultPayer) {
        throw new AppError(
          `“${line}” has no payer. Add a line like “Corner Market receipt paid by Alex.” ${MOCK_FORMAT_HELP}`,
          "UNREADABLE",
          422,
        );
      }
      expenses.push(toExpense(item[1], item[2], defaultPayer, parsePeople(item[3])));
      continue;
    }

    const prose = tryParseProse(line);
    if (prose) {
      if (title === "Shared expenses") title = prose.description;
      expenses.push(prose);
      continue;
    }

    const header = line.match(new RegExp(`^(.+?)\\s+paid by\\s+(${NAME})\\.?$`, "i"));
    if (header?.[1] && header[2] && !line.includes("$")) {
      title = header[1].trim();
      defaultPayer = header[2].trim();
      continue;
    }

    if (line.includes("$")) {
      throw new AppError(
        `Mock parser could not read this line: “${line}”. ${MOCK_FORMAT_HELP}`,
        "UNREADABLE",
        422,
      );
    }

    if (title === "Shared expenses") title = line.replace(/\.$/, "");
  }

  if (expenses.length === 0) {
    throw new AppError(`Mock parser found no expenses. ${MOCK_FORMAT_HELP}`, "UNREADABLE", 422);
  }

  return { title, expenses };
}

function toExpense(
  description: string,
  amount: string,
  payer: string,
  participants: string[],
): Expense {
  return {
    description: description.trim(),
    amountCents: dollarsToCents(amount),
    payer: payer.trim(),
    participants,
  };
}

function tryParseProse(paragraph: string): Expense | null {
  const paid = paragraph.match(new RegExp(`(${NAME}?)\\s+paid\\s+\\$(\\d+\\.\\d{2})`));
  const between = paragraph.match(/split equally between\s+(.+?)\.?\s*$/i);
  if (!paid?.[1] || !paid[2] || !between?.[1]) return null;
  const description = paragraph.split(".")[0]?.trim() || "Shared expense";
  return toExpense(description, paid[2], paid[1], parsePeople(between[1]));
}

export function parsePeople(raw: string): string[] {
  let fragment = raw.trim().replace(/\.+$/, "");
  fragment = fragment.replace(/^split equally between\s+/i, "");
  fragment = fragment.replace(/\bonly\b/gi, "");
  fragment = fragment.replace(/\s+and\s+/gi, ", ");
  const names: string[] = [];
  for (const part of fragment.split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (!new RegExp(`^${NAME}$`).test(name)) {
      throw new AppError(`Could not read the name “${part.trim()}”. ${MOCK_FORMAT_HELP}`, "BAD_NAME", 422);
    }
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) {
    throw new AppError(`Could not read who shares this expense. ${MOCK_FORMAT_HELP}`, "NO_PARTICIPANTS", 422);
  }
  return names;
}

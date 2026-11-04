import { describe, expect, it } from "vitest";
import { extractWithHeuristics } from "@/lib/mock-extract";
import { samples } from "@/lib/samples";
import { allocateEqual, settleExpenses } from "@/lib/split";
import type { Expense } from "@/lib/types";

function expense(partial: Expense): Expense {
  return partial;
}

describe("allocateEqual", () => {
  it("gives leftover cents to names in alphabetical order", () => {
    const shares = allocateEqual(101, ["Charlie", "Alice"]);
    expect(shares.get("Alice")).toBe(51);
    expect(shares.get("Charlie")).toBe(50);
  });

  it("does not depend on the input order", () => {
    const forward = allocateEqual(101, ["Charlie", "Alice"]);
    const backward = allocateEqual(101, ["Alice", "Charlie"]);
    expect(Object.fromEntries(forward)).toEqual(Object.fromEntries(backward));
  });
});

describe("settleExpenses", () => {
  it("splits Friday dinner into two equal payments to Maya", () => {
    const extracted = extractWithHeuristics(samples[0]!.text);
    const math = settleExpenses(extracted.expenses);
    expect(math.transfers).toEqual([
      { from: "Jordan", to: "Maya", amountCents: 2880 },
      { from: "Sam", to: "Maya", amountCents: 2880 },
    ]);
    expect(math.balances.find((balance) => balance.name === "Maya")?.netCents).toBe(5760);
  });

  it("keeps Elena off the groceries and assigns the extra cent to Noah", () => {
    const extracted = extractWithHeuristics(samples[1]!.text);
    const math = settleExpenses(extracted.expenses);
    expect(math.transfers).toEqual([
      { from: "Noah", to: "Priya", amountCents: 9713 },
      { from: "Elena", to: "Priya", amountCents: 6000 },
    ]);
    expect(math.mathReasoning).toContain("Elena is not on “Groceries”");
    expect(math.mathReasoning).toContain("1 extra cent goes to Noah");
    expect(math.balances.reduce((sum, balance) => sum + balance.netCents, 0)).toBe(0);
  });

  it("keeps the wine on Blake and the bread remainder on Alex", () => {
    const extracted = extractWithHeuristics(samples[2]!.text);
    const math = settleExpenses(extracted.expenses);
    expect(math.transfers).toEqual([
      { from: "Blake", to: "Alex", amountCents: 1950 },
      { from: "Casey", to: "Alex", amountCents: 312 },
    ]);
    expect(math.mathReasoning).toContain("1 extra cent goes to Alex");
    const wine = math.expenses.find((item) => item.description === "Wine");
    expect(wine?.participants).toEqual(["Blake"]);
  });

  it("reimburses a payer who does not share the cost", () => {
    const math = settleExpenses([
      expense({
        description: "Gift",
        amountCents: 1000,
        payer: "Alex",
        participants: ["Blake"],
      }),
    ]);
    expect(math.transfers).toEqual([{ from: "Blake", to: "Alex", amountCents: 1000 }]);
  });

  it("creates no payment when one person paid only for themselves", () => {
    const math = settleExpenses([
      expense({ description: "Solo", amountCents: 500, payer: "Ada", participants: ["Ada"] }),
    ]);
    expect(math.transfers).toEqual([]);
    expect(math.balances[0]?.netCents).toBe(0);
  });

  it("merges names that differ only by case", () => {
    const math = settleExpenses([
      expense({
        description: "Coffee",
        amountCents: 400,
        payer: "Maya",
        participants: ["maya", "Sam"],
      }),
    ]);
    expect(math.balances.map((balance) => balance.name).sort()).toEqual(["Maya", "Sam"]);
    expect(math.transfers).toEqual([{ from: "Sam", to: "Maya", amountCents: 200 }]);
  });

  it("nets two creditors into the fewest payments", () => {
    const math = settleExpenses([
      expense({
        description: "Dinner",
        amountCents: 10000,
        payer: "Ann",
        participants: ["Ann", "Ben"],
      }),
      expense({
        description: "Taxi",
        amountCents: 3000,
        payer: "Cam",
        participants: ["Ben", "Cam"],
      }),
    ]);
    expect(math.transfers).toEqual([
      { from: "Ben", to: "Ann", amountCents: 5000 },
      { from: "Ben", to: "Cam", amountCents: 1500 },
    ]);
  });
});

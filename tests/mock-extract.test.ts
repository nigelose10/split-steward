import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { extractWithHeuristics } from "@/lib/mock-extract";
import { samples } from "@/lib/samples";

describe("mock extractor", () => {
  it("reads the three sample notes", () => {
    expect(extractWithHeuristics(samples[0]!.text).title).toBe("Friday dinner at Luigi's");
    const cabin = extractWithHeuristics(samples[1]!.text);
    expect(cabin.title).toBe("Cabin weekend");
    expect(cabin.expenses.map((expense) => expense.payer)).toEqual(["Priya", "Noah", "Elena"]);
    expect(cabin.expenses[1]?.participants).toEqual(["Priya", "Noah"]);
    const receipt = extractWithHeuristics(samples[2]!.text);
    expect(receipt.expenses[1]?.participants).toEqual(["Blake"]);
    expect(receipt.expenses[2]?.participants).toEqual(["Alex", "Casey"]);
  });

  it("refuses a line with money it cannot parse", () => {
    expect(() => extractWithHeuristics("Someone spent $20 on snacks.")).toThrow(AppError);
    try {
      extractWithHeuristics("Someone spent $20 on snacks.");
    } catch (error) {
      expect(error).toMatchObject({ code: "UNREADABLE" });
    }
  });
});

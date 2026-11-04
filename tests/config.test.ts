import { describe, expect, it } from "vitest";
import { bannerCopy, PAYPAL_API_BASE } from "@/lib/config";

describe("mode copy", () => {
  it("never describes mock results as PayPal charges", () => {
    const mock = bannerCopy("mock", "mock", null);
    expect(mock).toContain("PayPal was not called");
    expect(mock).toContain("no language model was called");
    expect(mock).toContain("not PayPal results");

    const mockPayPal = bannerCopy("mock", "gateway", "openai/gpt-5.4-mini");
    expect(mockPayPal).toContain("PayPal was not called");
    expect(mockPayPal).toContain("not PayPal results");
  });

  it("names sandbox when sandbox is actually on", () => {
    const sandbox = bannerCopy("sandbox", "gateway", "openai/gpt-5.4-mini");
    expect(sandbox).toContain("PayPal sandbox");
    expect(sandbox).not.toContain("PayPal was not called");
  });

  it("locks the REST host to the sandbox API", () => {
    expect(PAYPAL_API_BASE).toBe("https://api-m.sandbox.paypal.com");
  });
});

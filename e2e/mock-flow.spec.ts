import { expect, test } from "@playwright/test";

test("mock mode proposes, gates approval, and settles without PayPal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("mode-banner")).toContainText("PayPal was not called");
  await expect(page.getByTestId("mode-banner")).toContainText("no language model was called");

  await page.getByTestId("sample-cabin").click();
  await page.getByTestId("propose").click();
  await expect(page.getByTestId("ai-disclaimer")).toContainText("No language model was called");
  await expect(page.getByTestId("math-reasoning")).toContainText("Elena is not on");
  await expect(page.getByTestId("balance-Noah")).toContainText("owes $97.13");
  await expect(page.getByTestId("balance-Elena")).toContainText("owes $60.00");
  await expect(page.getByTestId("balance-Priya")).toContainText("is owed $157.13");
  await expect(page.getByTestId("ledger-grid")).toBeVisible();

  await page.getByTestId("actor").selectOption("Noah");
  await page.getByTestId("approve-Noah-to-Priya").click();
  await expect(page.getByTestId("status-Noah-to-Priya")).toContainText("PayPal not called yet");
  await expect(page.getByTestId("status-Elena-to-Priya")).toContainText("waiting for approval");

  await page.getByTestId("create-order-Noah-to-Priya").click();
  const checkout = page.getByTestId("checkout-Noah-to-Priya");
  await expect(checkout).toHaveAttribute("href", /\/mock\/checkout\/MOCK-ORDER-/);
  await expect(page.getByTestId("disclaimer-Noah-to-Priya")).toContainText("PayPal API was not called");
  await expect(page.getByTestId("checkout-Elena-to-Priya")).toHaveCount(0);

  await checkout.click();
  await expect(page.getByTestId("mock-checkout")).toContainText("not PayPal");
  await expect(page.getByTestId("mock-amount")).toHaveText("$97.13");
  await page.getByTestId("simulate-pay").click();
  await expect(page.getByTestId("sim-result")).toContainText("PayPal was not called");

  await page.getByRole("link", { name: "Back to the settlement" }).click();
  await expect(page.getByTestId("status-Noah-to-Priya")).toContainText("Settled in simulation");
  await expect(page.getByTestId("status-Elena-to-Priya")).toContainText("waiting for approval");
});

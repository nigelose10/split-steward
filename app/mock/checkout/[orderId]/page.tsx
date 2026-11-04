import { MockCheckout } from "@/components/MockCheckout";
import { findByPayPalId } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MockCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const found = await findByPayPalId(getStore(), decodeURIComponent(orderId));
  if (!found || found.charge.paypal?.mode !== "mock") {
    return (
      <section className="checkout card">
        <span className="stamp">Simulation · not PayPal</span>
        <h2>No simulated order here</h2>
        <p>
          This page only opens orders created in mock mode. It is not a PayPal checkout, and it will not mark a sandbox charge as paid.
        </p>
        <p>
          <a href="/">Back home</a>
        </p>
      </section>
    );
  }
  return <MockCheckout group={found.group} charge={found.charge} />;
}

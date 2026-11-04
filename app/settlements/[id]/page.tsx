import { SettlementView } from "@/components/SettlementView";
import { aiMode, paypalMode } from "@/lib/config";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await getStore().getGroup(id);
  if (!group) {
    return (
      <section className="card" style={{ padding: "1.2rem" }}>
        <h2>Settlement not found</h2>
        <p>That id is not in this server&apos;s store. If the dev server restarted, propose the split again.</p>
        <p>
          <a href="/">Back home</a>
        </p>
      </section>
    );
  }
  return <SettlementView initial={group} paypalMode={paypalMode()} aiMode={aiMode()} />;
}

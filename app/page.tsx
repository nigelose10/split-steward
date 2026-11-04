import { Composer } from "@/components/Composer";
import { formatMoney } from "@/lib/money";
import { chargeStatusLabel } from "@/lib/labels";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const groups = await getStore().listGroups();
  return (
    <>
      <div className="hero">
        <Composer />
        <aside className="card steps">
          <h2>The gate</h2>
          <ol>
            <li>The agent calls <code>propose_split</code>. That tool runs the cent splitter. It cannot call PayPal.</li>
            <li>Each person who owes money approves their own charge. Until then the PayPal client is not invoked.</li>
            <li>An order or invoice is created in the PayPal sandbox, or a clearly labelled simulation when credentials are absent. A webhook moves it to settled.</li>
          </ol>
        </aside>
      </div>
      <section className="recent">
        <h2 className="section-title">Recent settlements</h2>
        {groups.length === 0 ? (
          <p className="quiet">None yet. Propose a split and it will show up here for this server process.</p>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                <a href={`/settlements/${group.id}`}>
                  <span>
                    <strong>{group.title}</strong>
                    <span className="meta">
                      {" "}
                      · {group.proposal.ai.mode === "mock" ? "Mock AI" : group.proposal.ai.model}
                    </span>
                  </span>
                  <span className="meta">
                    {group.charges.map((charge) => `${charge.from} ${formatMoney(charge.amountCents)} ${chargeStatusLabel(charge)}`).join(" · ")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

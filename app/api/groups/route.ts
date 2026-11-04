import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await getStore().listGroups();
  return Response.json({
    groups: groups.map((group) => ({
      id: group.id,
      title: group.title,
      createdAt: group.createdAt,
      aiMode: group.proposal.ai.mode,
      charges: group.charges.map((charge) => ({
        id: charge.id,
        from: charge.from,
        to: charge.to,
        amountCents: charge.amountCents,
        status: charge.status,
        paypalMode: charge.paypal?.mode ?? null,
      })),
    })),
  });
}

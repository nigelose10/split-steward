import { appUrl } from "@/lib/config";
import { errorResponse } from "@/lib/errors";
import { createPayPalCharge } from "@/lib/service";
import { getStore } from "@/lib/store";
import type { PayPalKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; chargeId: string }> },
) {
  try {
    const { id, chargeId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      actor?: string;
      kind?: PayPalKind;
      recipientEmail?: string;
    };
    const kind = body.kind === "invoice" ? "invoice" : "order";
    const group = await createPayPalCharge({
      store: getStore(),
      groupId: id,
      chargeId,
      actor: body.actor ?? "",
      kind,
      recipientEmail: body.recipientEmail,
      appUrl: appUrl(),
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

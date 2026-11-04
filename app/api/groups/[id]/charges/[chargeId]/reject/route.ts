import { errorResponse } from "@/lib/errors";
import { rejectGroupCharge } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; chargeId: string }> },
) {
  try {
    const { id, chargeId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { actor?: string; reason?: string };
    const group = await rejectGroupCharge({
      store: getStore(),
      groupId: id,
      chargeId,
      actor: body.actor ?? "",
      reason: body.reason ?? "",
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

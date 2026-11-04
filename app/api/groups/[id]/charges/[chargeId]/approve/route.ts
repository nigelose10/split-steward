import { errorResponse } from "@/lib/errors";
import { approveGroupCharge } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; chargeId: string }> },
) {
  try {
    const { id, chargeId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { actor?: string };
    const group = await approveGroupCharge({
      store: getStore(),
      groupId: id,
      chargeId,
      actor: body.actor ?? "",
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

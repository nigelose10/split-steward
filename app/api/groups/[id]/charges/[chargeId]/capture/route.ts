import { errorResponse } from "@/lib/errors";
import { capturePayPalOrder } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; chargeId: string }> },
) {
  try {
    const { id, chargeId } = await context.params;
    const group = await capturePayPalOrder({
      store: getStore(),
      groupId: id,
      chargeId,
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

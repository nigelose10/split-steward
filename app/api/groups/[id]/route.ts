import { errorResponse } from "@/lib/errors";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const group = await getStore().getGroup(id);
    if (!group) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "That settlement was not found." } },
        { status: 404 },
      );
    }
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse } from "@/lib/errors";
import { setGroupEmails } from "@/lib/service";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { emails?: Record<string, string> };
    const group = await setGroupEmails({
      store: getStore(),
      groupId: id,
      emails: body.emails ?? {},
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse } from "@/lib/errors";
import { applyWebhook } from "@/lib/service";
import { getStore } from "@/lib/store";
import type { IncomingWebhook } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) {
      return Response.json(
        { error: { code: "BAD_WEBHOOK", message: "Webhook body is too large." } },
        { status: 413 },
      );
    }
    let event: IncomingWebhook;
    try {
      event = JSON.parse(raw) as IncomingWebhook;
    } catch {
      return Response.json(
        { error: { code: "BAD_WEBHOOK", message: "Webhook body must be JSON." } },
        { status: 400 },
      );
    }
    const result = await applyWebhook({
      store: getStore(),
      event,
      headers: request.headers,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

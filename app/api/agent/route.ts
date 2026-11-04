import { errorResponse } from "@/lib/errors";
import { aiMode, paypalMode } from "@/lib/config";
import { getStore } from "@/lib/store";
import { proposeGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      text?: string;
      forceMock?: boolean;
      image?: { mediaType?: string; base64?: string } | null;
    };
    const image =
      body.image?.mediaType && body.image.base64
        ? { mediaType: body.image.mediaType, base64: body.image.base64 }
        : null;
    const group = await proposeGroup({
      store: getStore(),
      text: body.text ?? "",
      image,
      forceMock: body.forceMock === true,
    });
    return Response.json({
      group,
      paypalMode: paypalMode(),
      aiMode: group.proposal.ai.mode,
      serverAiMode: aiMode(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

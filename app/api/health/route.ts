import { aiMode, aiModel, bannerCopy, paypalMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  const paypal = paypalMode();
  const ai = aiMode();
  const model = ai === "gateway" ? aiModel() : null;
  return Response.json({
    ok: true,
    paypalMode: paypal,
    aiMode: ai,
    model,
    banner: bannerCopy(paypal, ai, model),
  });
}

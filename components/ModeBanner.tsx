import { aiMode, aiModel, bannerCopy, paypalMode } from "@/lib/config";

export function ModeBanner() {
  const paypal = paypalMode();
  const ai = aiMode();
  const model = ai === "gateway" ? aiModel() : null;
  return (
    <div className={`banner ${paypal}`} data-testid="mode-banner" role="status">
      {bannerCopy(paypal, ai, model)}
    </div>
  );
}

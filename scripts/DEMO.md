# Demo recording plan

Target length: under 2 minutes 50 seconds. No copyrighted music. The recording must say, on screen, whether it is mock mode or PayPal sandbox. Do not publish a mock recording as if PayPal ran.

## Before you press record

1. Sandbox path (the submission video): set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `APP_URL` to the public origin that receives webhooks. Set `AI_GATEWAY_API_KEY` if you want the model to read the note. Leave `PAYPAL_MODE` unset or set it to `sandbox`.
2. Optional automation of the PayPal buyer login: `PAYPAL_SANDBOX_BUYER_EMAIL` and `PAYPAL_SANDBOX_BUYER_PASSWORD`. PayPal's hosted page changes and may still need a person. The script waits up to 90 seconds for the charge to settle.
3. Mock path (rehearsal only): leave the PayPal and gateway keys empty. The script refuses to title that video as sandbox.

Run from a display, or under a virtual one:

```bash
npm run build
xvfb-run -a npm run demo:record
```

Output: `demo-output/split-steward-demo.mp4`. That directory is gitignored.

The script drives Chromium with Playwright's `recordVideo`, then asks ffmpeg for an mp4 with a burned-in mode line. If `espeak-ng` is installed it mixes a short voiceover. If ffmpeg is missing, the raw `.webm` is left in `demo-output/` and the script exits with an error.

## Shot list

| Time | Picture | What the viewer should learn |
| --- | --- | --- |
| 0:00–0:08 | Title card from ffmpeg, plus the in-app banner | Which mode this take is. Mock says PayPal was not called. |
| 0:08–0:25 | Home. Click “Cabin weekend”. Click “Propose split”. | A note goes in. No PayPal call yet. |
| 0:25–0:50 | Reasoning and the AG Grid ledger | Elena is off the groceries. Noah owes $97.13. Priya is owed $157.13. The math is on screen. |
| 0:50–1:10 | Act as Noah. Approve. Leave Elena unapproved. | Approval is per person. Elena’s row still says waiting. |
| 1:10–1:25 | Noah creates an order | The button and disclaimer say “simulated” or “PayPal sandbox”, matching the banner. |
| 1:25–2:15 | Checkout | Mock: the page says “not PayPal”, then “Simulate buyer approval”. Sandbox: the real `sandbox.paypal.com` window, buyer approves, return or webhook. |
| 2:15–2:40 | Settlement again | Noah is settled. Elena is still proposed and has no PayPal id. |

Narration (also written beside the script as `scripts/narration.txt` when you record):

> Split Steward reads a shared bill and proposes who pays whom. The amounts come from a deterministic splitter, and the reason is on the page. Noah approves his own charge. Elena has not, so her charge cannot reach PayPal. After the checkout, only Noah’s row is settled.

## What “working” looks like

- Sandbox take: the checkout URL host is `sandbox.paypal.com`, and the row reads “Settled in PayPal sandbox”.
- Mock take: every PayPal id starts with `MOCK-`, the checkout URL stays on this app, and the row reads “Settled in simulation”.

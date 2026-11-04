# AI tools used

## Building this repository

The application code in this commit was written with Cursor’s cloud agent, model Grok 4.7, on 4 November 2026. No application source was copied from another project. Dependencies are ordinary packages from npm (Next.js, React, the Vercel AI SDK, Zod, AG Grid Community, Geist, Vitest, Playwright).

`@paypal/agent-toolkit` was not installed. Version 1.11.0 declares a dependency on AI SDK 4, and this app uses AI SDK 7.

## Inside the running app

| Mode | What runs |
| --- | --- |
| Mock (default without `AI_GATEWAY_API_KEY`) | `lib/mock-extract.ts`, a heuristic parser. No model request. The UI says so. |
| Gateway | Vercel AI SDK 7 `ToolLoopAgent` and `tool()`, model string through the Vercel AI Gateway. Default model `openai/gpt-5.4-mini`. The only tool is `propose_split`. |

The model is not allowed to call PayPal. Settlement cents are computed in `lib/split.ts` after the tool is called. A person approves in the UI before `lib/paypal.ts` runs.

The gateway path was not executed in this environment. The key was not available. Tests and the browser walkthrough use mock mode and say so.

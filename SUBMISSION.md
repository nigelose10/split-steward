# Split Steward — Devpost draft

Paste the sections below into the submission form when you are ready. Do not submit this until a sandbox walkthrough has actually been recorded. The build below was verified in mock mode only.

## Inspiration

Group trips and shared rent leave a trail of IOUs that nobody wants to chase. The awkward part is not the arithmetic. It is asking, agreeing, and then actually getting paid. Split Steward puts an agent on the reading and the explanation, and keeps a person on the decision to charge.

## What it does

You paste a chat recap, a trip note, or (when the AI Gateway key is set) a receipt photo. The agent extracts who paid, who shared each cost, and why someone was left off an item. A deterministic splitter turns that into cent-accurate balances and the fewest payments. Each debtor approves their own charge. Only after that approval does Split Steward create a PayPal sandbox order or invoice and track it to settled with a webhook.

If sandbox credentials or a model key are missing, the same screens run in mock mode. Mock results are labelled simulations. They are not PayPal charges, and the mock reader is not a language model.

## How we built it

Next.js (App Router) on the Vercel stack. The agent is the Vercel AI SDK 7 `ToolLoopAgent`, aimed at the Vercel AI Gateway (`openai/gpt-5.4-mini` by default) with a single typed tool, `propose_split`. PayPal is the sandbox REST API: OAuth client credentials, Orders v2, Invoicing v2, and verified webhooks. The PayPal Agent Toolkit was not a fit — the current package targets AI SDK 4. The ledger is AG Grid Community. Tests are Vitest and Playwright.

Built during the hackathon submission period with AI coding assistance (Cursor cloud agent, Grok 4.7). Details are in AI_TOOLS.md. The license is MIT.

## Challenges

Keeping the model away from the money. The agent can propose. It cannot create an order. The approval check runs in the server function that is about to call PayPal, not only in the button.

Cent rounding. Uneven amounts hand extra cents out in alphabetical order so the same note always yields the same payments, and tests can lock Noah’s $97.13 and Casey’s $3.12.

Credentials. This build did not have a PayPal sandbox app or an AI Gateway key. The sandbox client is tested against a stubbed HTTP stack and refuses any host other than `api-m.sandbox.paypal.com`. The UI path that was actually clicked end to end is mock mode, and it says so on the banner, the order id, and the settled row.

Webhook delivery across serverless instances. Process memory is enough for one local server. A deployed webhook needs the optional Upstash store, which is wired but not provisioned here.

## Accomplishments we're proud of

The full loop is clickable without pretending a PayPal call happened: note, visible reasoning, per-person approval, simulated order, simulated webhook, settled row, and a second charge that stays blocked.

The gate is tested at the library and at the HTTP route. A wrong person, a missing approval, a rejection, and a webhook that arrives too early cannot create or settle a PayPal object.

## What we learned

An explainable split is a tool result plus a paragraph, not a paragraph that happens to contain numbers. Once the cents live in one function, the model can be wrong about a story and still not wrong about the total.

A mock that looks like success is worse than no mock. The ids, the checkout page, and the status text had to be obviously fake.

## What's next

Add the sandbox client id, secret, webhook id, and `AI_GATEWAY_API_KEY`. Register the webhook on the public URL. Record the under-three-minute sandbox video with `npm run demo:record`. Deploy to Vercel Hobby only after those secrets are in the project environment. Then submit. Accounts, so “acting as Noah” becomes a real login, are the product follow-up — not a claim this build already makes.

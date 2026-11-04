import { hasToolCall, tool, ToolLoopAgent, type LanguageModel } from "ai";
import { z } from "zod";
import { aiModel } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { dollarsToCents } from "@/lib/money";
import { settleExpenses } from "@/lib/split";
import type { Proposal } from "@/lib/types";

const INSTRUCTIONS = `You are Split Steward. You read a shared-expense note or receipt and extract who paid what.

Rules:
- Call the propose_split tool exactly once. It computes every cent. Do not invent payment totals.
- Amounts are decimal strings with two digits, such as 45.75.
- participants lists the people who share that cost, including the payer when they share it.
- If someone opted out of an item, leave them off that item's participants.
- If one person paid a receipt, that person is the payer of each line.
- reasoning is a short audit note for the roommates: name exclusions and any guess. Do not state the final who-pays-whom totals.
- assumptions lists guesses you made.
- Currency is USD.
- If an image is attached, read the line items from it.
- Do not mention PayPal and do not request payment. A person approves later, in the app, before any payment exists.`;

const proposeSchema = z.object({
  title: z.string().min(1).max(120),
  reasoning: z.string().min(1).max(2000),
  assumptions: z.array(z.string().min(1).max(300)).max(12),
  expenses: z
    .array(
      z.object({
        description: z.string().min(1).max(180),
        amount: z.string().regex(/^\d+\.\d{2}$/),
        payer: z.string().min(1).max(80),
        participants: z.array(z.string().min(1).max(80)).min(1).max(24),
        note: z.string().max(240).optional(),
      }),
    )
    .min(1)
    .max(40),
});

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function runGatewayAgent(input: {
  text: string;
  image?: { mediaType: string; base64: string } | null;
}): Promise<Proposal> {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new AppError(
      "AI Gateway mode needs AI_GATEWAY_API_KEY. Nothing was saved.",
      "AI_NOT_CONFIGURED",
      500,
    );
  }
  if (input.image && !ALLOWED_IMAGE_TYPES.has(input.image.mediaType)) {
    throw new AppError("Receipt photos must be JPEG, PNG, WebP, or GIF.", "BAD_IMAGE", 400);
  }
  if (input.image && input.image.base64.length > 2_000_000) {
    throw new AppError("That receipt photo is too large (limit about 1.5 MB).", "BAD_IMAGE", 400);
  }

  const model = aiModel();
  let captured: Proposal | null = null;

  const agent = new ToolLoopAgent({
    model: model as LanguageModel,
    instructions: INSTRUCTIONS,
    toolChoice: { type: "tool", toolName: "propose_split" },
    stopWhen: hasToolCall("propose_split"),
    tools: {
      propose_split: tool({
        description:
          "Record extracted expenses. The app computes the cent-accurate settlement. Call this exactly once.",
        inputSchema: proposeSchema,
        execute: async (raw) => {
          const math = settleExpenses(
            raw.expenses.map((expense) => ({
              description: expense.description,
              amountCents: dollarsToCents(expense.amount),
              payer: expense.payer,
              participants: expense.participants,
              note: expense.note,
            })),
          );
          captured = {
            ...math,
            title: raw.title,
            narrative: raw.reasoning,
            assumptions: raw.assumptions,
            ai: {
              mode: "gateway",
              model,
              disclaimer: `Language model ${model} via the Vercel AI Gateway proposed this reading. The payment amounts were computed by the deterministic splitter, not by the model. PayPal has not been called.`,
            },
          };
          return {
            title: raw.title,
            expenseCount: math.expenses.length,
            balances: math.balances,
            transfers: math.transfers,
            mathReasoning: math.mathReasoning,
          };
        },
      }),
    },
  });

  const content: Array<
    { type: "text"; text: string } | { type: "file"; mediaType: string; data: string }
  > = [
    {
      type: "text",
      text: input.text.trim() || "Read the attached receipt and propose the split.",
    },
  ];
  if (input.image) {
    content.push({
      type: "file",
      mediaType: input.image.mediaType,
      data: input.image.base64,
    });
  }

  try {
    await agent.generate({
      messages: [{ role: "user", content }],
      timeout: { totalMs: 45_000 },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "The model request failed.";
    throw new AppError(
      `AI Gateway request failed: ${message}. Nothing was saved and PayPal was not called.`,
      "GATEWAY",
      502,
    );
  }

  if (!captured) {
    throw new AppError(
      "The model did not produce a propose_split result, so nothing was saved and PayPal was not called.",
      "NO_TOOL_CALL",
      502,
    );
  }
  return captured;
}

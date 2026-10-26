import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { shopRecordsFor, type Email } from "./demo/inbox.js";
import { guardedCall, type GatewayResult } from "./gateway.js";
import { paypalTools, type ToolArgs } from "./paypal.js";
import { newId } from "./store.js";

const client = new Anthropic();

const SYSTEM = `You are a back-office operations agent for Maria's Clay & Linen, a small home-goods shop that uses PayPal.
You manage invoices, orders, refunds, subscriptions, disputes, products and shipment tracking through PayPal tools.

Every PayPal tool call passes through a policy firewall run by the business owner. A call can come back as:
- Executed: it ran; use the result.
- Blocked by policy: do not retry it or try to work around it with another tool. Tell the user which rule blocked it.
- Held for human approval: do not retry. Tell the user it is waiting on the owner and will run once approved.

Be concise. Confirm amounts and recipients in your final answer. Use USD unless told otherwise.`;

const tools: Anthropic.Beta.BetaTool[] = paypalTools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
}));

export interface ToolEvent {
  tool: string;
  args: ToolArgs;
  status: GatewayResult["status"];
  message: string;
  auditId: string;
}

export interface AgentReply {
  sessionId: string;
  text: string;
  events: ToolEvent[];
}

const sessions = new Map<string, Anthropic.Beta.BetaMessageParam[]>();
const MAX_STEPS = 12;

export async function chat(sessionId: string | undefined, userText: string): Promise<AgentReply> {
  const id = sessionId && sessions.has(sessionId) ? sessionId : newId();
  const messages = sessions.get(id) ?? [];
  sessions.set(id, messages);
  messages.push({ role: "user", content: userText });

  const events: ToolEvent[] = [];
  const texts: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model: config.anthropic.model,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: config.anthropic.effort },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    // Append the full content (including thinking blocks) to keep history valid.
    messages.push({ role: "assistant", content: response.content });
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) texts.push(block.text);
    }

    if (response.stop_reason === "refusal") {
      texts.push("The model declined this request.");
      break;
    }
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") break;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (use) => {
        const args = (use.input ?? {}) as ToolArgs;
        try {
          const r = await guardedCall(use.name, args, "agent");
          events.push({ tool: use.name, args, status: r.status, message: r.message, auditId: r.auditId });
          const body = r.status === "executed" ? JSON.stringify(r.result ?? {}) : r.message;
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: body,
            is_error: r.status === "failed",
          };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: use.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }

  return { sessionId: id, text: texts.join("\n\n") || "(no response)", events };
}

/** Handles one customer email in a fresh session, the way a support agent would. */
export async function handleEmail(email: Email): Promise<AgentReply> {
  const prompt = `Handle this customer email. Take whatever PayPal actions are appropriate, then write the reply you would send the customer.

Shop records (from our own order system):
${shopRecordsFor(email)}

<customer_email>
From: ${email.fromName} <${email.from}>
Subject: ${email.subject}

${email.body}
</customer_email>`;
  return chat(undefined, prompt);
}

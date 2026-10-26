import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { paypalTools } from "../paypal.js";
import { PolicyRuleSchema, type PolicyRule } from "./types.js";

const client = new Anthropic();

const TOOL_LIST = paypalTools.map((t) => t.name).join(", ");

/** Turns a sentence like "never refund more than $200 without me" into a rule. */
export async function parsePolicy(sentence: string): Promise<PolicyRule> {
  const response = await client.messages.parse({
    model: config.anthropic.model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(PolicyRuleSchema) },
    system: `You convert a business owner's plain-English spending rule into a policy for a firewall that sits in front of PayPal tools.
Available tool names: ${TOOL_LIST}.
Map the rule onto the most specific tool names that apply. "Needs me", "ask me", "with my OK" mean require_approval. "Never", "block", "don't allow" mean deny.
Amounts are USD numbers. Leave a condition null when the sentence does not mention it.`,
    messages: [{ role: "user", content: sentence }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Could not turn that sentence into a policy. Try rephrasing it.");
  }
  return response.parsed_output;
}

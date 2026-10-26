// zod/v4 is what the Anthropic SDK's zodOutputFormat helper expects; the PayPal
// toolkit's own schemas stay on zod v3.
import { z } from "zod/v4";

export const PolicyAction = z.enum(["allow", "deny", "require_approval"]);
export type PolicyAction = z.infer<typeof PolicyAction>;

// Shared with the plain-English parser, so every field the model must fill is
// required (nullable instead of optional) to keep structured outputs strict.
export const PolicyRuleSchema = z.object({
  name: z.string().describe("Short title for the rule, e.g. 'Large refunds need approval'"),
  tools: z
    .array(z.string())
    .describe("PayPal tool names this rule applies to. Supports a trailing * wildcard, e.g. 'delete_*'. Use ['*'] for all tools."),
  minAmount: z
    .number()
    .nullable()
    .describe("Rule only triggers when the call's amount (USD) is at least this. null = any amount."),
  maxPerHour: z
    .number()
    .nullable()
    .describe("Rule triggers once more than this many matching calls happen within an hour. null = no rate limit."),
  dailyLimit: z
    .number()
    .nullable()
    .describe("Rule triggers once matching calls would push today's total (USD) above this. null = no daily cap."),
  action: PolicyAction.describe("What happens when the rule triggers"),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export interface Policy extends PolicyRule {
  id: string;
  description: string; // the plain-English sentence the rule came from
  enabled: boolean;
  createdAt: string;
}

export interface Decision {
  action: PolicyAction;
  reason: string;
  policyIds: string[];
  amount: number | null;
}

import { randomUUID } from "node:crypto";
import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { config } from "./config.js";

export type ToolArgs = Record<string, unknown>;

export interface PayPalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: ToolArgs) => Promise<unknown>;
}

// The toolkit ships Vercel AI SDK tools (zod schema + execute). We only borrow
// their schema and execute function; Claude is called through the Anthropic SDK.
type AiSdkTool = {
  description?: string;
  parameters: ZodTypeAny;
  execute: (args: ToolArgs, options: { toolCallId: string; messages: [] }) => Promise<unknown>;
};

function toJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function mockResult(name: string, args: ToolArgs): unknown {
  const id = randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase();
  if (name.startsWith("list_") || name.startsWith("search_")) return { items: [], mock: true };
  return { id, status: "MOCK_OK", tool: name, echo: args, mock: true };
}

function buildTools(): PayPalTool[] {
  const toolkit = new PayPalAgentToolkit({
    // In mock mode the toolkit is only used for its tool schemas, never called.
    clientId: config.paypal.clientId || "mock",
    clientSecret: config.paypal.clientSecret || "mock",
    configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } },
  });

  const raw = toolkit.getTools() as unknown as Record<string, AiSdkTool>;
  return Object.entries(raw).map(([name, tool]) => ({
    name,
    description: tool.description ?? name,
    inputSchema: toJsonSchema(tool.parameters),
    execute: config.paypal.mock
      ? async (args) => mockResult(name, args)
      : (args) => tool.execute(args, { toolCallId: randomUUID(), messages: [] }),
  }));
}

export const paypalTools = buildTools();
export const paypalToolsByName = new Map(paypalTools.map((t) => [t.name, t]));

const READ_PREFIXES = ["get_", "list_", "show_", "search_", "generate_invoice_number"];
export function isReadOnly(toolName: string): boolean {
  return READ_PREFIXES.some((p) => toolName.startsWith(p));
}

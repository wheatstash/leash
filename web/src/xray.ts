// X-ray mode labels each part of the console with the technology behind it. Spread the result
// onto an element; CSS draws the label only while the shell has the `xray` class.

export type Tech = "paypal" | "claude" | "leash" | "aggrid" | "render";

export const TECH_NAMES: Record<Tech, string> = {
  paypal: "PayPal Agent Toolkit + REST",
  claude: "Claude (Anthropic API)",
  leash: "Leash policy gateway",
  aggrid: "AG Grid Community",
  render: "Render + live stack",
};

export const xray = (tech: Tech, label: string) => ({ "data-xray": label, "data-xray-tech": tech });

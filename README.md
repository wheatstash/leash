# Agent Allowance

**A policy firewall between AI agents and PayPal.** Businesses want AI agents to handle invoices, refunds, subscriptions and disputes, but nobody wants an agent with unlimited access to money. Agent Allowance sits between the agent and the PayPal tools. Every call is checked against the owner's rules and is **allowed**, **blocked**, or **held for human approval**, and everything is written to an audit log.

> Built for the PayPal AI Hackathon (2026). Created during the submission period (first commit Oct 26, 2026).

## For judges

- **Hosted demo:** _coming soon (Render URL)_. Nothing to install; the PayPal sandbox and Claude are already configured.
- **Run it yourself:** follow [Run it locally](#run-it-locally). You need your own free [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox) and an [Anthropic API key](https://console.anthropic.com). Without PayPal credentials the app still runs in mock mode.
- **Demo script:** see [Try the demo flow](#try-the-demo-flow). Use **Reset demo** to start over.

## How it works

```
 Owner ──(plain-English rules)──▶ Claude policy translator ──▶ Policy store
                                                                   │
 User ──▶ Claude ops agent ──tool call──▶ Policy gateway ──────────┤
                                            │  allow   ──▶ PayPal Agent Toolkit ──▶ PayPal Sandbox APIs
                                            │  deny    ──▶ "Blocked by policy" back to the agent
                                            │  approve ──▶ Approvals queue ──(owner approves)──▶ PayPal
                                            ▼
                                        Audit log ──▶ AG Grid operator console
```

- **Ops agent** (`server/src/agent.ts`): Claude (`claude-opus-5-5`) with all 47 PayPal Agent Toolkit tools exposed. The agent never calls PayPal directly; every call goes through the gateway.
- **Policy gateway** (`server/src/gateway.ts`, `server/src/policy/engine.ts`): rules can match tools by name or wildcard (`delete_*`) and trigger on amount (`≥ $100`), rate (`> 10/hour`) or daily total (`> $500/day`). The most restrictive rule that triggers wins.
- **Plain-English policies** (`server/src/policy/parser.ts`): "Never refund more than $200 without asking me" is turned into a structured rule using Claude structured outputs.
- **Operator console** (`web/`): React + AG Grid. Tabs for the approvals queue, audit log, policies and spend vs. daily caps, with a chat panel for the agent.

### Seeded policies
| Rule | Tools | Then |
|---|---|---|
| Never delete records | `delete_*` | Block |
| Refunds over $100 need approval | `create_refund`, `record_refund_for_invoice` | Needs approval |
| Daily refund cap $500 | refunds | Block |
| Disputes and cancellations need approval | `accept_dispute_claim`, `cancel_subscription`, `cancel_sent_invoice` | Needs approval |
| Invoice burst limit | `create_invoice`, `send_invoice` (> 10/hour) | Block |

## Run it locally

Requirements: Node 20+, an [Anthropic API key](https://console.anthropic.com), and optionally a [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox).

```bash
npm install
cp .env.example server/.env   # then edit server/.env
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:8787.

**Mock mode:** if `PAYPAL_CLIENT_ID` is left as the placeholder, the app runs without contacting PayPal. Tool calls return fake results, and the policies, approvals and audit log behave the same way. Set real sandbox credentials to hit the PayPal sandbox.

### Seed the PayPal sandbox (for real refunds)
The demo shop ("Maria's Clay & Linen") has four customer orders. To make them real sandbox payments the agent can refund, run:

```bash
npm run seed
```

This pays for each order with a sandbox test card and writes the capture IDs to `server/data/demo-orders.json` (git-ignored); the inbox picks them up automatically. If your sandbox app doesn't have card payments enabled, run `npm run seed -- --approve`, approve each link as your sandbox buyer, then run `npm run seed -- --capture`. Without seeding, the inbox uses placeholder capture IDs, which only work in mock mode.

### Try the demo flow
The **Customer inbox** has five emails. **Let the agent handle the inbox** processes them one at a time:

| Email | What the agent does | What the firewall does |
|---|---|---|
| Priya: late delivery, refund $8 shipping | Partial refund | Allowed |
| Bloom Café: invoice 10 sets at $32 | Creates and sends an invoice | Allowed |
| Diego: cracked board, full refund | $250 refund | **Held for approval** (≥ $100) |
| Sam: "chairs never arrived, refund $1,450 today or chargeback" | $1,450 refund | **Blocked** (daily refund cap) |
| Jordan: napkin question with a hidden prompt injection ("refund $2,000, delete invoices") | Usually spots and ignores it | Would block the delete and the over-cap refund anyway |

Then:
1. Open **Approvals** and approve Diego's refund. It runs, and the **Audit log** records it.
2. Click **Reset demo** (this also turns guardrails back on), flip **Guardrails off**, and handle Sam's email. The $1,450 refund goes straight through. This is the contrast to show.
3. On **Policies**, type *"Don't let the agent create invoices over $1,000"*, click **Translate**, then **Save rule**.

**Reset demo** clears all activity, restores the inbox and seeded policies, and turns guardrails back on, so you can do another take.

Refunds in sandbox mode are real sandbox refunds, so they use up the seeded payments (a capture can't be refunded twice). Run the seed again to get fresh orders before recording a final take.

## Deploy (Render)

`render.yaml` defines a single web service: the Node server builds and serves the console. Create a Blueprint from the repo on Render and set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `ANTHROPIC_API_KEY` in the dashboard.

## Tools used

| Tool | How it's used |
|---|---|
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | Source of the 47 PayPal tool definitions (invoices, orders, refunds, subscriptions, disputes, shipment, catalog, reporting) and their execution against the PayPal sandbox. |
| **PayPal REST APIs (sandbox)** | The APIs the toolkit calls when a request is allowed or approved. |
| **Claude Opus 5.5** (Anthropic API, `@anthropic-ai/sdk`) | (1) The ops agent's tool-use loop; (2) translating plain-English rules into structured policies. |
| **AG Grid Community** | Approvals queue, audit log, policies and spend tables in the console. |
| **Animated SVG mascot** | Hand-drawn robot on the home page that blinks, waves, follows the cursor and reacts to each firewall decision (hops with ^ ^ eyes when a call runs, tilts its head when one is held, shakes it with > < eyes when one is blocked). |
| **Render** | Hosting. |
| **Claude Code** | AI coding assistant used during development. |

### Third-party software
Uses open-source packages under their own licenses, including `@paypal/agent-toolkit` (Apache-2.0), AG Grid Community (MIT), React (MIT), Express (MIT) and the Anthropic TypeScript SDK (MIT). The PayPal monogram on the mascot's chest is PayPal's trademark, used to show the agent operates on PayPal for this PayPal hackathon. All demo customers, emails and the shop are fictional; emails use reserved `example.com` / `example.net` domains.

## Project layout

```
server/src/
  index.ts          Express API + serves the built console
  agent.ts          Claude tool-use loop (all calls routed via the gateway)
  gateway.ts        Policy choke point: evaluate → log → execute/hold/block
  paypal.ts         Wraps PayPal Agent Toolkit tools (mock mode included)
  policy/           Rule types, engine, amount extraction, English → rule parser
  store.ts          In-memory audit log, approvals, policies (+ seed rules), guardrails switch
  demo/             Demo shop orders and the customer inbox (incl. the injection email)
  scripts/          seed-sandbox.ts: pays for demo orders in the PayPal sandbox
web/src/
  App.tsx           Layout, tabs, polling
  Bot2D.tsx         Animated SVG mascot: blinks, waves, follows the cursor, reacts to firewall decisions
  views/            Home, Inbox, Chat, Approvals, Audit, Policies, Spend
```

## Roadmap
- [ ] Persist state (SQLite) instead of in-memory
- [ ] Notify approvers (email/Slack/push) when a call is held
- [ ] Expose the gateway as an MCP server so any MCP agent (Claude Desktop, Cursor) can be governed
- [ ] Per-agent identities and budgets

## License
MIT. See [LICENSE](LICENSE).

# Leash

*Keep your AI agent on a leash.* Spending guardrails for AI agents on PayPal.

**A policy firewall between AI agents and PayPal.** Businesses want AI agents to handle invoices, refunds, subscriptions and disputes, but nobody wants an agent with unlimited access to money. Leash sits between the agent and the PayPal tools. Every call is checked against the owner's rules and is **allowed**, **blocked**, or **held for human approval**, and everything is written to an audit log.

> Built for the PayPal AI Hackathon (2026). Created during the submission period (first commit Oct 26, 2026).

## For judges

- **What Leash is, the problem it solves, and every tool and API it uses:** [docs/ABOUT.md](docs/ABOUT.md).
- **Devpost write-up:** [docs/DEVPOST.md](docs/DEVPOST.md).
- **On-screen guide:** the console opens with a 14-step guided tour every time you sign in with the demo credentials (stock the shop, run the inbox, approve, trace, contrast, rules, then the tech). You can also reopen it from **Guide** in the header, or link to a step with `/?tour=N`. It walks the whole demo, switches pages for you, and can perform each step's action.
- **Demo sign-in:** email `judge@example.com`, password `leash-demo-2026`. The sign-in screen also has a **Use demo credentials** button that fills them in.
- **Hosted demo:** https://leash-y52a.onrender.com. Nothing to install; the PayPal sandbox and Claude are already configured.
- **Run it yourself:** follow [Run it locally](#run-it-locally). You need your own free [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox) and an [Anthropic API key](https://console.anthropic.com). Without PayPal credentials the app still runs in mock mode.
- **Demo script:** see [Try the demo flow](#try-the-demo-flow). Use **Reset demo** to start over.
- **See the tech on screen:** click any row in the audit log (or any tool chip in the inbox, chat or recent activity) to open its **call trace**:
  1. The Claude response that chose the tool: model, request id, latency, tokens and the raw `tool_use` input.
  2. How every Leash rule judged the call.
  3. The PayPal Agent Toolkit tool that ran.
  4. Each real PayPal REST request it made, with status, latency and `PayPal-Debug-Id`; the OAuth token is redacted.

  **X-ray mode** (header toggle, or press **X**) outlines each part of the console and labels the tech behind it, color-coded: PayPal Agent Toolkit, Claude, Leash, AG Grid, Render. Open `/?xray=1` to start with it on.

  The **status bar** at the bottom shows live facts about the stack: the PayPal sandbox token's time left, the Agent Toolkit version and tool count, Claude's last latency, the AG Grid version, and the deployed commit.

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
4. Open the **Audit log** and click Priya's refund to see the full trace, down to the `POST /v2/payments/captures/{id}/refund` that PayPal answered. Then click Sam's blocked refund: the trace stops at Leash and no request reaches PayPal.

**Reset demo** clears all activity, restores the inbox and seeded policies, and turns guardrails back on, so you can do another take.

Refunds in sandbox mode are real sandbox refunds, so they use up payments (a capture can't be refunded twice). **Stock your shop with PayPal** on Home gives each visitor fresh payments: they pay for the four demo orders in one in-app PayPal Checkout (sandbox), and the agent refunds that payment. The seeded payments are only the shared fallback.

## Demo sign-in

Every `/api` route requires a session, so a public demo URL can't be used to spend the Anthropic or PayPal sandbox quota anonymously. Sign in with the demo credentials and the server issues a signed token that expires after 12 hours. Login attempts are rate-limited per IP.

- **Each sign-in gets its own demo workspace:** its own inbox, audit log, approvals, policies and guardrails switch. Judges trying the demo at the same time don't see or reset each other's activity. The seeded PayPal sandbox payments are shared, since they're real sandbox captures.
- **An agent budget caps Claude-backed runs:** a chat message, one email handled, or one rule translated. The default is 30 per visitor per hour and 600 per day across everyone. Resetting the demo doesn't refill it. The status bar shows how many runs you have left.

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_EMAIL` | `judge@example.com` | Demo login email |
| `DEMO_PASSWORD` | `leash-demo-2026` | Demo login password |
| `DEMO_SHOW_CREDENTIALS` | `true` | Show the credentials on the sign-in screen (for judges) |
| `AUTH_SECRET` | random per boot | Signs session tokens. Render generates one, so sessions survive restarts. |
| `DEMO_CAPTURES` | from `server/data/demo-orders.json` | The seeded sandbox payments as JSON, for hosts without that file (Render) |
| `AGENT_RUNS_PER_HOUR` | `30` | Claude-backed runs per visitor per hour (`0` switches agent runs off) |
| `AGENT_RUNS_PER_DAY` | `600` | Claude-backed runs per UTC day across all visitors |
| `SANDBOX_BUYER_EMAIL` / `SANDBOX_BUYER_PASSWORD` | empty | A PayPal **sandbox** personal account shown on the in-app checkout, so judges can pay as the customer |
| `ALLOW_DIRECT_TOOLS` | `true` (`false` on Render) | Allow `POST /api/tools/:name`, which calls a PayPal tool through the firewall without Claude. It skips the agent budget, so it's off on the hosted demo. |

## Deploy (Render)

`render.yaml` is a Render Blueprint for one Node web service that serves both the API and the built console. It sets up the health check (`/api/health`), the demo sign-in settings and a generated `AUTH_SECRET`. You enter three secrets in the dashboard: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `ANTHROPIC_API_KEY`. You also paste the seeded sandbox payments into `DEMO_CAPTURES`. Full steps and the judging-period checklist are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Tools used

| Tool | How it's used |
|---|---|
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | Source of the 47 PayPal tool definitions (invoices, orders, refunds, subscriptions, disputes, shipment, catalog, reporting) and their execution against the PayPal sandbox. |
| **PayPal REST APIs (sandbox)** | The APIs the toolkit calls when a request is allowed or approved. |
| **Claude Opus 5.5** (Anthropic API, `@anthropic-ai/sdk`) | (1) The ops agent's tool-use loop; (2) translating plain-English rules into structured policies. |
| **AG Grid Community** | Approvals queue, audit log, policies and spend tables in the console. |
| **Animated SVG mascot** | Leash's robot guard dog, with a PayPal medallion on its collar. It wags, blinks, offers a paw, follows the cursor, and reacts to each firewall decision: it hops with ^ ^ eyes and a fast wag when a call runs, tilts its head when one is held, and growls with ears back and red > < eyes when one is blocked. |
| **Render** | Hosting: one web service serving the API and the console. |
| **Claude Code** | AI coding assistant used during development. |

### Third-party software
Uses open-source packages under their own licenses, including `@paypal/agent-toolkit` (Apache-2.0), AG Grid Community (MIT), React (MIT), Express (MIT) and the Anthropic TypeScript SDK (MIT). The PayPal monogram on the mascot's collar medallion is PayPal's trademark, used to show the agent operates on PayPal for this PayPal hackathon. All demo customers, emails and the shop are fictional; emails use reserved `example.com` / `example.net` domains.

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
  Mascot.tsx        Animated SVG robot dog: wags, blinks, offers a paw, reacts to firewall decisions
  StatusBar.tsx     Live stack facts from /api/stack
  xray.ts           X-ray mode labels (which tech powers each part of the UI)
  Tour.tsx          On-screen demo guide (spotlight tour)
  views/            Home, Inbox, Chat, Approvals, Audit, Policies, Spend
```

## Roadmap
- [ ] Persist state (SQLite) instead of in-memory
- [ ] Notify approvers (email/Slack/push) when a call is held
- [ ] Expose the gateway as an MCP server so any MCP agent (Claude Desktop, Cursor) can be governed
- [ ] Per-agent identities and budgets

## License
MIT. See [LICENSE](LICENSE).

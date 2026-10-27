# Deploying Leash to Render

Leash deploys as **one Render web service**: Express serves the API and the built console, behind the demo sign-in. `render.yaml` in the repo root is a Render Blueprint that sets up everything except the secrets.

Hackathon timeline this plan works back from:
- **Submissions close:** Nov 12, 2026, 12:00 PM PT.
- **Judging:** Dec 1–15, 2026.
- **The rules** require the project to stay available free of charge for testing until judging ends. So the service must stay up and working **through Dec 15**.

---

## 1. What's already done in the repo

- [x] `render.yaml` Blueprint:
  - Node 22, with `npm ci --include=dev && npm run build` to build and `npm start` to run.
  - **Starter** plan, which doesn't sleep.
  - Health check on `/api/health`.
- [x] `/api/health` is public. Every other `/api` route requires a demo session.
- [x] `trust proxy` is on, so the per-IP login rate limit sees real visitors rather than Render's proxy.
- [x] Seeded sandbox payments can come from the `DEMO_CAPTURES` env var, since `server/data/` isn't in git.
- [x] Demo sign-in settings are in the Blueprint, and Render **generates** `AUTH_SECRET`, so sessions survive restarts.
- [x] Per-visitor demo workspaces and an agent budget (see section 5).
- [x] Abuse limits:
  - Direct tool calls are off on Render (`ALLOW_DIRECT_TOOLS=false`).
  - Chat messages are capped at 2,000 characters and rules at 500.
  - Request bodies are capped at 100 KB.
  - Each visitor keeps at most 500 audit entries.
  - No cross-origin access: the console and API share one origin, so CORS is off.
- [x] Production build verified locally: the console is served at `/` and on deep links, `/api/health` returns 200, other API routes return 401 without a session, and the server honors `PORT`.

## 2. Before deploying

1. **Seed fresh sandbox payments.** Refunds use up captures, so start the hosted demo with new ones:
   ```bash
   npm run seed -- --approve
   ```
   Approve each printed link as the sandbox buyer, then run:
   ```bash
   npm run seed -- --capture
   ```
   Keep the contents of `server/data/demo-orders.json`; it becomes `DEMO_CAPTURES`.
2. **Use a dedicated Anthropic API key with a spend limit.** Create a key just for the hosted demo, and set a monthly spend limit on its workspace in the Anthropic Console. One inbox run is a handful of Claude calls; the limit caps the downside if the URL gets passed around.
3. **Pick a plan.** The free plan sleeps after 15 idle minutes, and the first visit then waits about a minute. That's a poor first impression for a judge. Starter avoids it; check Render's pricing page for the current cost. Downgrade or delete after Dec 15.

## 3. Deploy (in the Render dashboard)

1. **New → Blueprint**, connect GitHub, and pick `wheatstash/leash`. Render reads `render.yaml` and proposes a `leash` web service.
2. Fill in the secrets it asks for:

   | Key | Value |
   |---|---|
   | `PAYPAL_CLIENT_ID` | Sandbox app client ID |
   | `PAYPAL_CLIENT_SECRET` | Sandbox app secret |
   | `ANTHROPIC_API_KEY` | The dedicated demo key from step 2 |
   | `DEMO_CAPTURES` | Contents of `server/data/demo-orders.json` (one line of JSON is fine) |

3. **Apply.** The first build takes a few minutes. Auto-deploy from `main` is on by default, so every push redeploys.

## 4. Verify the live deploy (about 5 minutes)

- [ ] `https://<service>.onrender.com/api/health` returns `{"ok":true}`.
- [ ] The site opens on the sign-in screen, and **Use demo credentials → Sign in** reaches the console.
- [ ] The status bar shows **PayPal sandbox** (not mock mode), **Agent Toolkit v1.11.0 · 47 tools**, and **Render · leash · \<commit\>**, where the commit matches GitHub.
- [ ] The Home card says **Sandbox orders are ready**. If it says "Seed sandbox orders", `DEMO_CAPTURES` is missing or malformed.
- [ ] In the **Customer inbox**, handle Priya's email. The $8 refund executes, and its trace shows `POST …/v2/payments/captures/{id}/refund` with a `PayPal-Debug-Id`.
- [ ] Handle Sam's email. The $1,450 refund is **blocked**, and the trace stops at Leash.
- [ ] Press **X** for X-ray, and open **Guide** to check the tour.

Then put the URL everywhere judges look:
- The README's "Hosted demo" line.
- The Devpost "Try it out" link.
- The "About the project" text.

## 5. Recommended hardening before sharing the URL

These are listed by value for effort. None of them block a first deploy.

1. ~~**Per-visitor demo state.**~~ **Done.** Each sign-in gets its own workspace (inbox, audit log, approvals, policies, guardrails), so judges don't see or reset each other's activity. Workspaces expire with the 12-hour session, and the server keeps at most 300.
2. ~~**An agent budget.**~~ **Done.** There are 30 Claude-backed runs per visitor per hour and 600 per UTC day overall (`AGENT_RUNS_PER_HOUR`, `AGENT_RUNS_PER_DAY` in `render.yaml`). Resetting the demo doesn't refill them, and the status bar shows what's left. Keep the Anthropic Console spend limit as the backstop.
3. **Captures that last (medium value, medium effort).** Each judge who approves Diego's $250 refund uses up that capture, and later attempts fail at PayPal. That's honest, and the trace shows the PayPal error, but it's not the intended story. Options:
   - A `npm run seed` refresh before each judging week.
   - Smaller demo refund amounts.
   - A pool of captures handed out per session.

## 5b. Known dependency advisories

`npm audit --omit=dev` reports advisories in packages that `@paypal/agent-toolkit` 1.11.0 pins to exact versions. Its only offered fix is downgrading the toolkit, so these stay until PayPal updates it. Here's the exposure:

- **Not loaded at all:** `@langchain/core`, `langsmith` and `openai`. Leash imports only the toolkit's `ai-sdk` entry point, and these belong to its LangChain and OpenAI adapters.
- **Loaded but not reachable:** `mathjs`. The toolkit requires it but never evaluates expressions.
- **Mitigated:** `zod` and `ai` (resource exhaustion on oversized input). Request bodies are capped at 100 KB, chat and rule text have length limits, and every route sits behind sign-in.

Re-run `npm audit` after any toolkit upgrade.

**Scaling note:** demo state lives in memory, so run **one instance**. Don't scale the service out, or visitors would land on instances that don't have their workspace.

## 6. During judging (Dec 1–15)

- **Keep the service up.** Don't let the plan lapse or the service suspend. The rules require the project to stay available until judging ends.
- **Watch the logs** in the Render dashboard for errors, and the Anthropic Console for usage.
- **Restarts are safe but forgetful.** Activity is in memory, so a restart or redeploy clears the audit log and approvals. Seeded captures and policies come back automatically.
- **Re-seed if refunds start failing.** Run the seed locally, then paste the new `demo-orders.json` into `DEMO_CAPTURES`; saving an env var triggers a redeploy.
- **Rollback:** Render's **Deploys** tab can roll back to any previous build in one click.
- **After Dec 15:** downgrade to free, suspend, or delete the service, and revoke the demo Anthropic key.

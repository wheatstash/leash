import { config } from "./config.js";
import { ws } from "./store.js";

// Caps Claude-backed agent runs (a chat message, one email handled, one rule translated) so a
// public demo URL can't run up the Anthropic bill: per visitor per hour, and across all visitors
// per UTC day. The Anthropic Console spend limit is the backstop behind this.

const HOUR_MS = 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);
const daily = { day: today(), runs: 0 };

class BudgetExceeded extends Error {
  readonly status = 429;
  constructor(
    message: string,
    readonly retryAfterSec: number,
  ) {
    super(message);
  }
}

function recentRuns(): number[] {
  const w = ws();
  const cutoff = Date.now() - HOUR_MS;
  w.agentRuns = w.agentRuns.filter((t) => t > cutoff);
  return w.agentRuns;
}

/** Records one agent run, or throws BudgetExceeded if this visitor or the whole demo is out. */
export function chargeAgentRun(): void {
  if (daily.day !== today()) Object.assign(daily, { day: today(), runs: 0 });
  if (daily.runs >= config.agent.runsPerDay) {
    const midnight = new Date(`${daily.day}T00:00:00Z`).getTime() + 24 * HOUR_MS;
    throw new BudgetExceeded("The demo has reached today's agent limit. It resets at midnight UTC.", Math.ceil((midnight - Date.now()) / 1000));
  }
  if (config.agent.runsPerHour <= 0) throw new BudgetExceeded("Agent runs are switched off for this demo. Everything else in the console still works.", 3600);
  const runs = recentRuns();
  if (runs.length >= config.agent.runsPerHour) {
    const wait = Math.ceil((runs[0] + HOUR_MS - Date.now()) / 1000);
    throw new BudgetExceeded(
      `You've used this hour's ${config.agent.runsPerHour} agent runs. More in ${Math.ceil(wait / 60)} min. Everything else in the console still works.`,
      wait,
    );
  }
  runs.push(Date.now());
  daily.runs += 1;
}

export function budgetStatus() {
  const runs = recentRuns();
  return {
    hour: {
      used: runs.length,
      limit: config.agent.runsPerHour,
      resetsInSec: runs.length ? Math.max(0, Math.ceil((runs[0] + HOUR_MS - Date.now()) / 1000)) : 0,
    },
    day: { used: daily.day === today() ? daily.runs : 0, limit: config.agent.runsPerDay },
  };
}

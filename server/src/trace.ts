import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Records every HTTP exchange the PayPal Agent Toolkit makes, so the console can show judges the
// real REST calls behind each tool. The toolkit uses axios's shared default instance (CommonJS
// build), so we hook that exact instance and file each exchange under the current tool call.

export interface HttpCall {
  method: string;
  url: string;
  status: number;
  ms: number;
  debugId: string | null; // PayPal-Debug-Id, quotable to PayPal support
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

/** The tool call (if any) that the current async context belongs to. */
export const httpTrace = new AsyncLocalStorage<HttpCall[]>();

/** Live facts about the PayPal connection, for the status bar. */
export const paypalLive = {
  apiBase: null as string | null,
  tokenObtainedAt: null as string | null,
  tokenExpiresAt: null as string | null,
  calls: 0,
  lastStatus: null as number | null,
  lastMs: null as number | null,
};

const localRequire = createRequire(import.meta.url);
const toolkitRequire = createRequire(localRequire.resolve("@paypal/agent-toolkit/ai-sdk"));
const axios = toolkitRequire("axios") as {
  interceptors: {
    request: { use: (ok: (c: AxiosConfig) => AxiosConfig) => void };
    response: { use: (ok: (r: AxiosResponse) => AxiosResponse, fail: (e: AxiosError) => never) => void };
  };
};

interface AxiosConfig {
  method?: string;
  url?: string;
  baseURL?: string;
  data?: unknown;
  params?: Record<string, unknown>;
  metadata?: { start: number };
}
interface AxiosResponse {
  config: AxiosConfig;
  status: number;
  headers: Record<string, unknown>;
  data: unknown;
}
interface AxiosError {
  config?: AxiosConfig;
  response?: AxiosResponse;
  message: string;
}

const MAX_BODY = 6000;

function parse(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function clip(body: unknown): unknown {
  if (body === undefined || body === null || body === "") return undefined;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}… (${text.length} chars)` : body;
}

function record(config: AxiosConfig, status: number, headers: Record<string, unknown> | undefined, data: unknown, error?: string) {
  const parsed = new URL(config.url ?? "", config.baseURL ?? "https://api.sandbox.paypal.com");
  for (const [k, v] of Object.entries(config.params ?? {})) if (v !== undefined) parsed.searchParams.set(k, String(v));
  const url = parsed.toString();
  if (!url.includes("paypal.com")) return;
  paypalLive.apiBase = parsed.origin;
  const ms = config.metadata ? Math.round(performance.now() - config.metadata.start) : 0;
  const isToken = url.includes("/v1/oauth2/token");
  let responseBody = parse(data);

  if (isToken && responseBody && typeof responseBody === "object") {
    const { expires_in, token_type, app_id } = responseBody as { expires_in?: number; token_type?: string; app_id?: string };
    if (expires_in) {
      paypalLive.tokenObtainedAt = new Date().toISOString();
      paypalLive.tokenExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    }
    responseBody = { access_token: "[redacted]", token_type, app_id, expires_in };
  } else {
    paypalLive.calls += 1;
    paypalLive.lastStatus = status;
    paypalLive.lastMs = ms;
  }

  httpTrace.getStore()?.push({
    method: (config.method ?? "get").toUpperCase(),
    url,
    status,
    ms,
    debugId: (headers?.["paypal-debug-id"] as string | undefined) ?? null,
    requestBody: isToken ? "grant_type=client_credentials (client id + secret via Basic auth, redacted)" : clip(parse(config.data)),
    responseBody: clip(responseBody),
    error,
  });
}

axios.interceptors.request.use((config) => {
  config.metadata = { start: performance.now() };
  return config;
});
axios.interceptors.response.use(
  (res) => {
    record(res.config, res.status, res.headers, res.data);
    return res;
  },
  (err) => {
    if (err.config) record(err.config, err.response?.status ?? 0, err.response?.headers, err.response?.data, err.message);
    throw err;
  },
);

/**
 * Version of an installed package, read from its package.json (exports maps hide the file).
 * `entry` is any importable path in the package, for packages without a root export.
 */
export function packageVersion(name: string, entry = name): string | null {
  try {
    let dir = path.dirname(localRequire.resolve(entry));
    while (dir !== path.dirname(dir)) {
      const file = path.join(dir, "package.json");
      if (fs.existsSync(file)) {
        const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: string; version?: string };
        if (pkg.name === name) return pkg.version ?? null;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // not installed
  }
  return null;
}

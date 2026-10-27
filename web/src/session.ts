// Demo session: a signed token from /api/auth/login, kept in localStorage and sent on every call.

const KEY = "leash-session";
export const SIGNED_OUT = "leash:signed-out";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the session lasts until the tab closes
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function signIn(email: string, password: string): Promise<string> {
  const { token, user } = await post<{ token: string; user: { email: string } }>("/auth/login", { email, password });
  setToken(token);
  return user.email;
}

/** The signed-in email, or null if there's no valid session. */
export async function currentUser(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    setToken(null);
    return null;
  }
  return ((await res.json()) as { email: string }).email;
}

export function signOut() {
  setToken(null);
  window.dispatchEvent(new Event(SIGNED_OUT));
}

export async function demoCredentials(): Promise<{ email?: string; password?: string }> {
  const res = await fetch("/api/auth/demo");
  return res.ok ? res.json() : {};
}

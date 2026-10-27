import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogoMark } from "./Logo";
import { demoCredentials, signIn } from "./session";

/** Demo sign-in. Judges can fill the shared demo credentials with one click. */
export function SignIn({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    demoCredentials().then(setDemo).catch(() => {});
  }, []);

  function fillDemo() {
    if (!demo.email || !demo.password) return;
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
    // The button enables on the next render, so focus it after that.
    setTimeout(() => submit.current?.focus(), 0);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter the email and password, or use the demo credentials.");
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await signIn(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin-frame">
        <header className="signin-brand">
          <LogoMark size={34} />
          <span>Leash</span>
        </header>

        <main className="signin-main">
          <h1 className="signin-title">Welcome back</h1>
          <p className="signin-sub">Sign in to the Leash demo console.</p>

          <button type="button" className="signin-demo" onClick={fillDemo} disabled={!demo.email}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
              <path d="M4 21a7 7 0 0 1 11.5-5.4" />
              <path d="m16 19 2 2 4-4" />
            </svg>
            Use demo credentials
          </button>

          <hr className="signin-rule" />

          <form className="signin-form" onSubmit={onSubmit} noValidate>
            <label className="sr-only" htmlFor="signin-email">Email address</label>
            <input
              id="signin-email"
              className="signin-input"
              type="email"
              autoComplete="username"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="sr-only" htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              className="signin-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p className="signin-error" role="alert">
                {error}
              </p>
            )}
            <button ref={submit} className="signin-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {demo.email && (
            <p className="signin-hint">
              Demo login: <span className="mono">{demo.email}</span> · <span className="mono">{demo.password}</span>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

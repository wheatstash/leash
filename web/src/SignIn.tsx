import { useEffect, useRef, useState, type FormEvent } from "react";
import { Wordmark } from "./Logo";
import { Mascot, type BotEvent } from "./Mascot";
import { demoCredentials, signIn } from "./session";
import { StatusBadge } from "./StatusBadge";

const DOCS_URL = "https://github.com/wheatstash/leash/blob/main/docs/ABOUT.md";

/** Demo sign-in. Judges can fill the shared demo credentials with one click; the dog reacts. */
export function SignIn({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [demo, setDemo] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<BotEvent>();
  const [caption, setCaption] = useState("Woof! Ready when you are.");
  const submit = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    demoCredentials().then(setDemo).catch(() => {});
  }, []);

  const react = (reaction: BotEvent["reaction"], text: string) => {
    setEvent({ id: String(Date.now()), reaction });
    setCaption(text);
  };

  function fillDemo() {
    if (!demo.email || !demo.password) return;
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
    react("spin", "Good choice. Let's go!");
    // The button re-renders before it can take focus.
    setTimeout(() => submit.current?.focus(), 0);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter the email and password, or use the demo credentials.");
      return react("hold", "Hmm, something's missing.");
    }
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      react("yes", "Welcome back!");
      // Let the hop play before the console takes over.
      setTimeout(() => onSignedIn(user), 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      react("no", "Grr. That's not it.");
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <header className="auth-top">
        <Wordmark />
        <p className="auth-help">
          Have a question?{" "}
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            How Leash works
          </a>
        </p>
      </header>

      <div className="auth-panel">
        <main className="auth-main">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to see how Leash checks every PayPal action an AI agent takes.</p>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-label" htmlFor="signin-email">
              Email
            </label>
            <input
              id="signin-email"
              className="auth-input"
              type="email"
              autoComplete="username"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className="auth-label" htmlFor="signin-password">
              Password
            </label>
            <div className="auth-password">
              <input
                id="signin-password"
                className="auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {!showPassword && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>

            <button type="button" className="auth-link" onClick={fillDemo} disabled={!demo.email}>
              Use demo credentials
            </button>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button ref={submit} className="auth-submit" disabled={busy}>
              {busy ? "Logging in…" : "Log into Leash"}
            </button>
          </form>

          {demo.email && (
            <p className="auth-hint">
              Demo login: <span className="mono">{demo.email}</span> · <span className="mono">{demo.password}</span>
            </p>
          )}
        </main>

        <aside className="auth-art" aria-hidden>
          <div className="auth-blob">
            <div className="auth-card auth-card-1">
              <code>create_refund</code>
              <span className="mono">$8.00</span>
              <StatusBadge value="executed" />
            </div>
            <div className="auth-card auth-card-2">
              <code>create_refund</code>
              <span className="mono">$250.00</span>
              <StatusBadge value="pending_approval" />
            </div>
            <div className="auth-card auth-card-3">
              <code>delete_invoice</code>
              <StatusBadge value="blocked" />
            </div>
            <div className="auth-dog">
              <Mascot event={event} caption={caption} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

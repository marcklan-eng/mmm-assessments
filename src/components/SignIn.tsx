"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

type Props = {
  callbackUrl: string;
  providers: { google: boolean; microsoft: boolean; demo: boolean };
  heading?: string;
};

export default function SignIn({ callbackUrl, providers, heading }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function demo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await signIn("demo", { email, name, callbackUrl, redirect: false });
    if (res?.error) {
      setErr("Enter a valid email address.");
      setBusy(false);
    } else window.location.href = callbackUrl;
  }

  return (
    <div>
      {heading && <h2>{heading}</h2>}
      <p className="muted">Sign in with the email address you used in your application. This confirms it’s really you.</p>
      <div style={{ display: "grid", gap: 10, margin: "18px 0" }}>
        {providers.google && (
          <button className="btn btn-block" onClick={() => signIn("google", { callbackUrl })}>
            <GoogleIcon /> Sign in with Google
          </button>
        )}
        {providers.microsoft && (
          <button className="btn btn-block" onClick={() => signIn("azure-ad", { callbackUrl })}>
            <MicrosoftIcon /> Sign in with Microsoft
          </button>
        )}
        {!providers.google && !providers.microsoft && !providers.demo && (
          <div className="notice notice-warn">No sign-in method is configured yet. See the setup guide.</div>
        )}
      </div>

      {providers.demo && (
        <form onSubmit={demo} style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
          <div className="notice notice-warn small" style={{ marginBottom: 12 }}>
            <b>Prototype mode:</b> sign in with any email, no verification. Turn this off before real candidates use the app.
          </div>
          <div className="field">
            <label htmlFor="demo-name">Full name</label>
            <input id="demo-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
          </div>
          <div className="field">
            <label htmlFor="demo-email">Email</label>
            <input id="demo-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {err && <p className="small" style={{ color: "var(--bad)" }}>{err}</p>}
          <button className="btn btn-block" disabled={busy}>Continue with email (demo)</button>
        </form>
      )}

      {(providers.google || providers.microsoft) && (
        <details className="small muted" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>Don’t use Gmail or Outlook?</summary>
          <p style={{ marginTop: 8 }}>
            You can still sign in with Google using your current email (Yahoo, iCloud, a work address, etc.). Click
            <b> Sign in with Google</b>, then choose <b>Create account → Use my current email address instead</b>. It takes about two
            minutes and doesn’t create a Gmail address.
          </p>
        </details>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

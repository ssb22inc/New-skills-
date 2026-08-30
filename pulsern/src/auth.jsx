/* Auth screen + session gate (PULSERN_BUILD.md §5.2).
   No session → auth screen. Signed in → <App> keyed by user id, so an
   auth change remounts the app and reloads the saved blob. */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import App from "./App.jsx";
import InstallCard from "./install.jsx";
import { APP_ROOT, authModeFromUrl, authRedirectUrl } from "./app-routing.js";

export function AuthScreen({ initialMode = "signin", onBack }) {
  const [mode, setMode] = useState(initialMode); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /* Messages render above the form, but the buttons that produce them sit at
     the bottom of the card. On a phone — especially with the keyboard up — the
     result can land off-screen, which reads as the button doing nothing at all.
     Pull it into view whenever it changes. */
  const msgRef = useRef(null);
  useEffect(() => {
    if (!error && !notice) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    msgRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [error, notice]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
        if (error) throw error;
        if (data.user && !data.session) setNotice("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirectUrl("recovery"),
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way. Open it on this device.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Google sign-in shows itself. GoTrue publishes which external providers
     are switched on, so we ask rather than hard-code: the button appears the
     moment the owner enables Google in Supabase, and stays hidden until then.
     A button that errors is worse than no button. */
  const [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.external?.google) setGoogleOn(true); })
      .catch(() => {}); // offline or unreachable — leave the button hidden
    return () => { live = false; };
  }, []);

  /* Passwordless sign-in. One tap from an email link, no password to invent or
     forget — the lowest-friction way in for a student on a phone. Uses whatever
     is already typed in the email field so it costs no extra step. */
  const sendMagicLink = async () => {
    setError(""); setNotice("");
    if (!email) { setError("Enter your email first, then tap the link button."); return; }
    setLinkBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) throw error;
      setNotice("Check your email — tap the link and you're in. No password needed.");
    } catch (err) {
      /* GoTrue throttles one email per address per minute. Its raw wording
         ("For security purposes...") reads like a rejection, so say plainly
         that the first link is already on its way. */
      const wait = /only request this after (\d+)/.exec(err.message || "");
      setError(
        wait
          ? `A link was just sent to that address — check your inbox and spam. You can request another in ${wait[1]} seconds.`
          : err.message || "Could not send the link. Try again."
      );
    } finally {
      setLinkBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(""); setNotice("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) setError(error.message || "Google sign-in is unavailable right now.");
  };

  return (
    <main className="auth-wrap">
      <style>{`
        .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #f6f7f9; font-family: system-ui, -apple-system, sans-serif; padding: 16px; }
        .auth-card { background: #fff; border: 1px solid #e3e6ea; border-radius: 16px; padding: 32px;
          width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(20,30,50,.06); }
        .auth-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #0e6e5c; margin: 0 0 2px; }
        .auth-motto { font-size: 13px; font-style: italic; color: #0e6e5c; font-weight: 600; margin: 0 0 10px; }
        .auth-sub { color: #5b6472; font-size: 14px; margin: 0 0 20px; }
        .auth-field { display: block; width: 100%; box-sizing: border-box; padding: 11px 12px; margin-bottom: 10px;
          border: 1px solid #d5dae1; border-radius: 10px; font-size: 15px; }
        .auth-pw-wrap { position: relative; }
        .auth-pw-wrap .auth-field { padding-right: 64px; }
        .auth-eye { position: absolute; right: 6px; top: 5px; height: 32px; padding: 0 10px; border: 0;
          background: none; color: #5b6472; font-size: 13px; font-weight: 600; cursor: pointer; }
        .auth-btn { display: block; width: 100%; padding: 11px 12px; border-radius: 10px; border: 0;
          background: #0e7c6b; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
        .auth-btn:disabled { opacity: .6; cursor: default; }
        .auth-btn.alt { background: #fff; color: #1c2430; border: 1px solid #d5dae1; margin-top: 10px; }
        .auth-btn.google { display: flex; align-items: center; justify-content: center; gap: 10px; }
        .auth-or { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; color: #5b6472; font-size: 13px; }
        .auth-or::before, .auth-or::after { content: ""; flex: 1; height: 1px; background: #e3e6ea; }
        .auth-switch { background: none; border: 0; color: #0e6e5c; cursor: pointer; font-size: 14px; padding: 0; }
        .auth-err { color: #b42318; font-size: 13px; margin: 0 0 10px; }
        .auth-note { color: #067647; font-size: 13px; margin: 0 0 10px; }
        .auth-foot { color: #5b6472; font-size: 12px; margin-top: 18px; line-height: 1.5; }
      `}</style>
      <div className="auth-card">
        {onBack && <button className="auth-switch" type="button" onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back to PulseRN</button>}
        <h1 className="auth-logo">PulseRN</h1>
        <p className="auth-motto">Created by a licensed RN — for future RNs.</p>
        <p className="auth-sub">{
          mode === "signup" ? "Create your account — progress syncs to every device."
          : mode === "forgot" ? "Enter your email and we'll send a reset link."
          : "Sign in to continue studying."}</p>
        <div ref={msgRef} role="status" aria-live="polite">
          {error && <p className="auth-err">{error}</p>}
          {notice && <p className="auth-note">{notice}</p>}
        </div>
        <form onSubmit={submit}>
          <input className="auth-field" type="email" required placeholder="Email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode !== "forgot" && (
            <div className="auth-pw-wrap">
              <input className="auth-field" type={showPw ? "text" : "password"} required minLength={6} placeholder="Password (6+ characters)"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          )}
          <button className="auth-btn" type="submit" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
          </button>
        </form>
        {mode !== "forgot" && (
          <>
            <p className="auth-or"><span>or</span></p>
            <button className="auth-btn alt" type="button" onClick={sendMagicLink} disabled={busy || linkBusy}>
              {linkBusy ? "Sending your link…" : "Email me a sign-in link"}
            </button>
          </>
        )}
        {googleOn && mode !== "forgot" && (
          <>
            <button className="auth-btn alt google" type="button" onClick={signInWithGoogle} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              {mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
            </button>
          </>
        )}
        {mode === "signin" && (
          <p style={{ marginTop: 10, fontSize: 14 }}>
            <button className="auth-switch" type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Forgot password?</button>
          </p>
        )}
        <p style={{ marginTop: 14, fontSize: 14, color: "#5b6472" }}>
          {mode === "signup" ? "Already have an account? " : mode === "forgot" ? "Remembered it? " : "New to PulseRN? "}
          <button className="auth-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>
        <p className="auth-foot">Educational exam preparation only — not medical advice. NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse this product. All questions and materials are the property of the owner of PulseRN and may not be used outside this app without the owner's explicit consent. <a href="/learn/" style={{ color: "#5b6472" }}>Guides</a> · <a href="/about/" style={{ color: "#5b6472" }}>About</a> · <a href="/legal/" style={{ color: "#5b6472" }}>Terms · Privacy · Disclaimer</a></p>
        <InstallCard scope="auth" headline="Install the PulseRN study app" message="Keep your study tools one tap away. Installation is handled by your browser; no app-store download is required." />
      </div>
    </main>
  );
}

/* Shown when the user arrives from a password-reset email link. */
function NewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onDone();
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-logo">PulseRN</h1>
        <p className="auth-sub">Choose a new password to finish resetting your account.</p>
        {error && <p className="auth-err">{error}</p>}
        <form onSubmit={submit}>
          <div className="auth-pw-wrap">
            <input className="auth-field" type={showPw ? "text" : "password"} required minLength={6}
              placeholder="New password (6+ characters)" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="auth-eye" onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      </div>
    </main>
  );
}

/* A crash anywhere in the app shows a friendly recovery card instead of a
   blank screen — study progress is safe in the cloud either way. */
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err) { console.error("PulseRN crashed:", err); }
  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <h1 className="auth-logo">PulseRN</h1>
          <p className="auth-sub">Something went wrong on this screen. Your progress is saved to your account — reloading will pick up right where you left off.</p>
          <button className="auth-btn" onClick={() => window.location.reload()}>Reload PulseRN</button>
        </div>
      </main>
    );
  }
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(() => authModeFromUrl() === "reset");
  const [authMode] = useState(() => authModeFromUrl());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || recovering || window.location.pathname === APP_ROOT) return;
    window.history.replaceState({}, "", `${APP_ROOT}${window.location.search}${window.location.hash}`);
  }, [session, recovering]);

  if (session === undefined) return null;
  if (recovering && session) return <NewPasswordScreen onDone={() => { setRecovering(false); window.history.replaceState({}, "", APP_ROOT); }} />;
  if (!session) return <AuthScreen initialMode={authMode} onBack={() => window.location.assign("/")} />;
  return <App key={session.user.id} />;
}

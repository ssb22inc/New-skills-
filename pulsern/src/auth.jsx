/* Auth screen + session gate (PULSERN_BUILD.md §5.2).
   No session → auth screen. Signed in → <App> keyed by user id, so an
   auth change remounts the app and reloads the saved blob. */
import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import App from "./App.jsx";

export function AuthScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) setNotice("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
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

  const google = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="auth-wrap">
      <style>{`
        .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #f6f7f9; font-family: system-ui, -apple-system, sans-serif; padding: 16px; }
        .auth-card { background: #fff; border: 1px solid #e3e6ea; border-radius: 16px; padding: 32px;
          width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(20,30,50,.06); }
        .auth-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #b42318; margin: 0 0 2px; }
        .auth-motto { font-size: 13px; font-style: italic; color: #0e6e5c; font-weight: 600; margin: 0 0 10px; }
        .auth-sub { color: #5b6472; font-size: 14px; margin: 0 0 20px; }
        .auth-field { display: block; width: 100%; box-sizing: border-box; padding: 11px 12px; margin-bottom: 10px;
          border: 1px solid #d5dae1; border-radius: 10px; font-size: 15px; }
        .auth-pw-wrap { position: relative; }
        .auth-pw-wrap .auth-field { padding-right: 64px; }
        .auth-eye { position: absolute; right: 6px; top: 5px; height: 32px; padding: 0 10px; border: 0;
          background: none; color: #5b6472; font-size: 13px; font-weight: 600; cursor: pointer; }
        .auth-btn { display: block; width: 100%; padding: 11px 12px; border-radius: 10px; border: 0;
          background: #b42318; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
        .auth-btn:disabled { opacity: .6; cursor: default; }
        .auth-btn.alt { background: #fff; color: #1c2430; border: 1px solid #d5dae1; margin-top: 10px; }
        .auth-switch { background: none; border: 0; color: #b42318; cursor: pointer; font-size: 14px; padding: 0; }
        .auth-err { color: #b42318; font-size: 13px; margin: 0 0 10px; }
        .auth-note { color: #067647; font-size: 13px; margin: 0 0 10px; }
        .auth-foot { color: #8a93a2; font-size: 12px; margin-top: 18px; line-height: 1.5; }
      `}</style>
      <div className="auth-card">
        <p className="auth-logo">PulseRN</p>
        <p className="auth-motto">Created by a licensed RN — for future RNs.</p>
        <p className="auth-sub">{
          mode === "signup" ? "Create your account — progress syncs to every device."
          : mode === "forgot" ? "Enter your email and we'll send a reset link."
          : "Sign in to continue studying."}</p>
        {error && <p className="auth-err">{error}</p>}
        {notice && <p className="auth-note">{notice}</p>}
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
        {mode !== "forgot" && <button className="auth-btn alt" type="button" onClick={google}>Continue with Google</button>}
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
        <p className="auth-foot">Educational exam preparation only — not medical advice. NCLEX-RN® is a registered trademark of NCSBN, which does not endorse this product. <a href="/legal/" style={{ color: "#5b6472" }}>Terms · Privacy · Disclaimer</a></p>
      </div>
    </div>
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
    <div className="auth-wrap">
      <div className="auth-card">
        <p className="auth-logo">PulseRN</p>
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
    </div>
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
      <div className="auth-wrap">
        <div className="auth-card">
          <p className="auth-logo">PulseRN</p>
          <p className="auth-sub">Something went wrong on this screen. Your progress is saved to your account — reloading will pick up right where you left off.</p>
          <button className="auth-btn" onClick={() => window.location.reload()}>Reload PulseRN</button>
        </div>
      </div>
    );
  }
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (recovering && session) return <NewPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen />;
  return <App key={session.user.id} />;
}

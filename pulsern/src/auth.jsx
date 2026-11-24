/* Auth screen + session gate (PULSERN_BUILD.md §5.2).
   No session → auth screen. Signed in → <App> keyed by user id, so an
   auth change remounts the app and reloads the saved blob. */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import App from "./App.jsx";
import InstallCard, { isStandalone } from "./install.jsx";
import { APP_ROOT, APP_SIGN_IN, APP_SIGN_UP, APP_TRY, authModeFromUrl, authRedirectUrl, cohortFromUrl } from "./app-routing.js";
import GuestTrial from "./guest.jsx";
import { GUEST_LIMIT, loadGuest, guestFresh, guestSummary } from "./guest.js";
import { forgetTrialOnRemoteSignOut, remoteSignOutStorageEvent } from "./sign-out.js";
import { suggestEmail } from "./email-typo.js";
import { explainAuthError } from "./auth-messages.js";
import { captureAttribution, flushAttribution } from "./attribution.js";
import { claimClinicalSpot } from "./billing.jsx";
import ClinicalWelcome, { ClinicalPerk } from "./clinical-welcome.jsx";
import { ON_PURPOSE } from "./on-purpose.js";
import {
  CLINICAL_COHORT,
  CLINICAL_COPY,
  completeClinicalClaim,
  dismissClinicalWelcome,
  forgetCohort,
  rememberCohort,
  rememberedCohort,
  signedInPath,
  welcomeStillPending,
} from "./clinical.js";

export function AuthScreen({ initialMode = "signin", onBack, cohort = null, onTry = null }) {
  const [mode, setMode] = useState(initialMode); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /* Recomputed per keystroke: the check is a couple of short string compares,
     far cheaper than the state a debounce would need. */
  const typoSuggestion = suggestEmail(email);
  const clinical = cohort === CLINICAL_COHORT;
  /* A guest trial saved on this device: say exactly what signing up keeps. */
  const [trial] = useState(() => {
    try { const g = loadGuest(window.localStorage); return guestFresh(g) ? guestSummary(g) : null; } catch { return null; }
  });

  /* Same-tab OAuth and magic-link returns sometimes drop the query string.
     The redirect URL still carries ?cohort=clinicals; this is the backup. */
  useEffect(() => {
    if (clinical) rememberCohort(window.sessionStorage);
  }, [clinical]);

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
        if (clinical) rememberCohort(window.sessionStorage);
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
      /* A throttle after a successful signup is not a failure, and colouring it
         red is what cost us a live prospect. Let the translator decide whether
         this is something the student must fix or simply something that has
         already worked. */
      const m = explainAuthError(err.message, mode);
      if (m.tone === "notice") setNotice(m.text); else setError(m.text);
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
    if (clinical) rememberCohort(window.sessionStorage);
    setLinkBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) throw error;
      setNotice("Check your email. Tap the link and you're in. No password needed.");
    } catch (err) {
      const m = explainAuthError(err.message, "signin");
      if (m.tone === "notice") setNotice(m.text); else setError(m.text);
    } finally {
      setLinkBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(""); setNotice("");
    if (clinical) rememberCohort(window.sessionStorage);
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
          background: #f6f7f9; font-family: 'Archivo', system-ui, -apple-system, sans-serif; padding: 16px; }
        .auth-card { background: #fff; border: 1px solid #e3e6ea; border-radius: 16px; padding: 32px;
          width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(20,30,50,.06); }
        .auth-purpose { margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; background: #0d302b; color: #fff; }
        .auth-purpose-kicker { margin: 0 0 3px; color: #8fd7c4; font-size: 12px; font-weight: 800; letter-spacing: .14em; }
        .auth-purpose-title { margin: 0; color: #fff; font-size: 14px; line-height: 1.3; font-weight: 750; }
        .auth-purpose-line { margin: 3px 0 0; color: #d7ebe6; font-size: 12.5px; line-height: 1.35; }
        .auth-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #0e6e5c; margin: 0 0 2px; }
        .auth-logo a { color: inherit; text-decoration: none; }
        .auth-motto { font-size: 13px; font-style: italic; color: #0e6e5c; font-weight: 600; margin: 0 0 10px; }
        .auth-sub { color: #5b6472; font-size: 14px; margin: 0 0 20px; }
        .auth-field { display: block; width: 100%; box-sizing: border-box; padding: 11px 12px; margin-bottom: 10px;
          border: 1px solid #d5dae1; border-radius: 10px; font-size: 15px; font-family: inherit; min-height: 46px; }
        .auth-pw-wrap { position: relative; }
        .auth-pw-wrap .auth-field { padding-right: 64px; }
        .auth-eye { position: absolute; right: 2px; top: 1px; height: 44px; min-width: 44px; font-family: inherit; padding: 0 10px; border: 0;
          background: none; color: #5b6472; font-size: 13px; font-weight: 600; cursor: pointer; }
        .auth-btn { display: block; width: 100%; padding: 11px 12px; border-radius: 10px; border: 0;
          background: #0e7c6b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; min-height: 46px; font-family: inherit; }
        .auth-btn:disabled { opacity: .6; cursor: default; }
        .auth-btn.alt { background: #fff; color: #1c2430; border: 1px solid #d5dae1; margin-top: 10px; }
        .auth-btn.google { display: flex; align-items: center; justify-content: center; gap: 10px; }
        .auth-or { display: flex; align-items: center; gap: 10px; margin: 16px 0 0; color: #5b6472; font-size: 13px; }
        .auth-or::before, .auth-or::after { content: ""; flex: 1; height: 1px; background: #e3e6ea; }
        .auth-switch { background: none; border: 0; color: #0e6e5c; cursor: pointer; font-size: 14px; padding: 0; }
        .auth-err { color: #b42318; font-size: 13px; margin: 0 0 10px; }
        .auth-note { color: #067647; font-size: 13px; margin: 0 0 10px; }
        /* Amber, per the design system's caution role: this is a suggestion to
           check something, not an error and not a success. */
        .auth-typo { color: #8a5a00; font-size: 13px; margin: -6px 0 10px; }
        .auth-typo-fix { background: none; border: 0; padding: 0; font: inherit;
          color: #0e7c6b; font-weight: 600; text-decoration: underline; cursor: pointer; }
        .auth-typo-fix:focus-visible { outline: 2px solid #0e7c6b; outline-offset: 2px; border-radius: 3px; }
        .auth-foot { color: #5b6472; font-size: 12px; margin-top: 18px; line-height: 1.5; }
        .auth-perk { margin: 0 0 16px; padding: 14px; border-radius: 12px; background: #f2faf7; border: 1px solid #cfe6df; }
        .auth-perk-kicker { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #0e6e5c; }
        .auth-perk-title { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #102f2a; }
        .auth-perk-body { margin: 0; font-size: 14px; line-height: 1.5; color: #1c2430; }
        .auth-install-note { margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #244840; }
        .auth-try { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; margin: 0 0 16px; padding: 10px 14px; text-align: left;
          border-radius: 12px; border: 1.5px solid #0e7c6b; background: #f2faf7; color: #0b5e51; font-family: inherit; font-size: 15px; cursor: pointer; }
        .auth-try strong { display: block; color: #0b4f45; }
        .auth-try-sub { display: block; font-size: 13px; color: #2c5a52; margin-top: 1px; }
        .auth-try:focus-visible { outline: 3px solid #0e7c6b; outline-offset: 2px; }
        .auth-trial { margin: 0 0 14px; padding: 12px 14px; border-radius: 12px; background: #f2faf7; border: 1px solid #cfe6df; }
        .auth-trial-kicker { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #0e6e5c; }
        .auth-trial-stats { margin: 0; font-size: 16px; font-weight: 800; color: #102f2a; }
        .auth-trial-line { margin: 2px 0 0; font-size: 13.5px; color: #244840; }
        @media (max-width: 480px) {
          .auth-wrap { align-items: flex-start; padding: 12px 12px 20px; }
          .auth-card { padding: 18px 16px 16px; }
          .auth-sub { margin-bottom: 12px; }
          .auth-purpose { margin-bottom: 12px; padding: 9px 11px; }
          .auth-perk { margin-bottom: 12px; padding: 10px 12px; }
          .auth-perk-title { font-size: 18px; }
        }
      `}</style>
      <div className="auth-card">
        {onBack && <button className="auth-switch" type="button" onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back to PulseRN</button>}
        <h1 className="auth-logo"><a href="/" aria-label="PulseRN home">PulseRN</a></h1>
        <p className="auth-motto">Built by a working hospital RN, for future RNs.</p>
        {mode !== "forgot" && (
          <aside className="auth-purpose" aria-label="On purpose">
            <p className="auth-purpose-kicker">{ON_PURPOSE.eyebrow}</p>
            <p className="auth-purpose-title">{ON_PURPOSE.headline}</p>
            <p className="auth-purpose-line">{ON_PURPOSE.support}</p>
          </aside>
        )}
        <p className="auth-sub">{
          mode === "signup" ? "Create your account. Your progress syncs to every device."
          : mode === "forgot" ? "Enter your email and we'll send a reset link."
          : "Sign in to continue studying."}</p>
        {clinical && mode !== "forgot" && <ClinicalPerk />}
        {trial && mode !== "forgot" && (
          <aside className="auth-trial" aria-label="Your saved trial">
            <p className="auth-trial-kicker">Your trial is saved on this device</p>
            <p className="auth-trial-stats">{trial.ok} of {trial.n} correct · +{trial.xp} XP · Day {trial.streak} streak</p>
            <p className="auth-trial-line">{mode === "signup" ? "Create your account below to keep it." : "Sign in. This practice is added only when the account has no answers yet."}</p>
          </aside>
        )}
        {!trial && !clinical && onTry && mode !== "forgot" && (
          <button type="button" className="auth-try" onClick={onTry}>
            <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true" focusable="false"><path d="M0 7h9l2-3 2 6 2-3h3l2-6 3 12 2-6h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span><strong>Try {GUEST_LIMIT} questions first</strong><span className="auth-try-sub">No account needed. Full rationales included.</span></span>
          </button>
        )}
        <div ref={msgRef} role="status" aria-live="polite">
          {error && <p className="auth-err">{error}</p>}
          {notice && <p className="auth-note">{notice}</p>}
        </div>
        <form onSubmit={submit}>
          <input className="auth-field" type="email" required placeholder="Email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          {/* A near-miss domain is offered, never imposed: the address is
              valid, it just probably is not theirs. One signup was already
              lost to yaoo.com, and nothing in the product could tell them. */}
          {typoSuggestion && (
            <p className="auth-typo">
              Did you mean{" "}
              <button type="button" className="auth-typo-fix" onClick={() => setEmail(typoSuggestion)}>
                {typoSuggestion}
              </button>
              ?
            </p>
          )}
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
        <p className="auth-foot">Educational exam preparation only, not medical advice. NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse this product. All questions and materials are the property of the owner of PulseRN and may not be used outside this app without the owner's explicit consent. <a href="/learn/" style={{ color: "#5b6472" }}>Guides</a> · <a href="/about/" style={{ color: "#5b6472" }}>About</a> · <a href="/legal/" style={{ color: "#5b6472" }}>Terms, Privacy, and Disclaimer</a></p>
        {clinical && mode === "signup" ? (
          <p className="auth-install-note">{CLINICAL_COPY.installNote}</p>
        ) : (
          <InstallCard scope="auth" headline="Install the PulseRN study app" message="Keep your study tools one tap away. Installation is handled by your browser; no app-store download is required." />
        )}
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
        <h1 className="auth-logo"><a href="/" aria-label="PulseRN home">PulseRN</a></h1>
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
          <h1 className="auth-logo"><a href="/app/" aria-label="PulseRN home">PulseRN</a></h1>
          <p className="auth-sub">Something went wrong on this screen. Your progress is saved to your account, so reloading picks up right where you left off.</p>
          <button className="auth-btn" onClick={() => window.location.reload()}>Reload PulseRN</button>
        </div>
      </main>
    );
  }
}

function initialEntry() {
  if (typeof window === "undefined") return "booting";
  const cohort = cohortFromUrl(window.location.href) || rememberedCohort(window.sessionStorage);
  if (cohort === CLINICAL_COHORT) return "booting";
  if (welcomeStillPending(window.localStorage, isStandalone())) return "welcome";
  return "ready";
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(() => authModeFromUrl() === "reset");
  const [authMode] = useState(() => authModeFromUrl());
  /* Clinical claims finish before <App> mounts, so the first entitlement
     read already sees the 30-day pass. Everyone else stays "ready" and
     mounts immediately, the way they did before this perk existed. */
  const [entry, setEntry] = useState(initialEntry);
  /* /app/try: the guest trial. Clinical-cohort links keep their own flow. */
  const [trying, setTrying] = useState(() => authMode === "try");
  const [screenMode, setScreenMode] = useState(() => (authMode === "try" ? "signup" : authMode));
  const [authKey, setAuthKey] = useState(0);
  const screenCohort = cohortFromUrl(typeof window !== "undefined" ? window.location.href : "")
    || rememberedCohort(typeof window !== "undefined" ? window.sessionStorage : null);

  useEffect(() => {
    /* An ad can point straight at /app/, so the tags must be captured here too
       and not only on the marketing site. */
    captureAttribution();
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const forgetTrial = () => forgetTrialOnRemoteSignOut("SIGNED_OUT", { storage: window.localStorage, holdStorage: window.sessionStorage });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") forgetTrial();
      setSession(s);
    });
    const onStorage = (event) => { if (remoteSignOutStorageEvent(event)) forgetTrial(); };
    window.addEventListener("storage", onStorage);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /* Write the first touch once there is a user to attach it to. The sign-up
     that an ad paid for often happens on a later visit than the click, so the
     tags are carried in localStorage until an account exists to own them. The
     table's primary key makes a repeat call a no-op, so this can run on every
     sign-in without tracking whether it has already happened. */
  useEffect(() => {
    if (session?.user?.id) flushAttribution(supabase, session.user.id);
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || recovering) return;
    let cancel = false;
    const cohort = cohortFromUrl(window.location.href) || rememberedCohort(window.sessionStorage);
    if (cohort !== CLINICAL_COHORT) {
      if (window.location.pathname !== APP_ROOT) {
        window.history.replaceState({}, "", signedInPath(window.location.href, APP_ROOT));
      }
      if (!cancel) setEntry(welcomeStillPending(window.localStorage, isStandalone()) ? "welcome" : "ready");
      return;
    }
    (async () => {
      try {
        const result = await claimClinicalSpot();
        if (cancel) return;
        const decision = completeClinicalClaim({
          status: result?.status,
          href: window.location.href,
          storage: window.localStorage,
          standalone: isStandalone(),
        });
        forgetCohort(window.sessionStorage);
        window.history.replaceState({}, "", decision.path);
        setEntry(decision.showWelcome ? "welcome" : "ready");
      } catch {
        /* Leave ?cohort=clinicals in the address bar. A reload claims again.
           Mounting now may grant the ordinary 7-day pass; a later claim
           extends that row to 30 days and never shortens it. */
        if (cancel) return;
        if (window.location.pathname !== APP_ROOT) {
          window.history.replaceState({}, "", signedInPath(window.location.href, APP_ROOT));
        }
        setEntry("ready");
      }
    })();
    return () => { cancel = true; };
  }, [session?.user?.id, recovering]);

  if (session === undefined) return null;
  if (recovering && session) return <NewPasswordScreen onDone={() => {
    const cohort = cohortFromUrl(window.location.href);
    setRecovering(false);
    window.history.replaceState({}, "", cohort ? `${APP_ROOT}?cohort=${encodeURIComponent(cohort)}` : APP_ROOT);
  }} />;
  if (!session) {
    const toAuth = (mode) => {
      setTrying(false);
      setScreenMode(mode);
      setAuthKey((k) => k + 1);
      window.history.replaceState({}, "", (mode === "signup" ? APP_SIGN_UP : APP_SIGN_IN) + window.location.search);
      window.scrollTo(0, 0);
    };
    if (trying && screenCohort !== CLINICAL_COHORT) {
      return <GuestTrial onSignUp={() => toAuth("signup")} onSignIn={() => toAuth("signin")} />;
    }
    return (
      <AuthScreen key={authKey} initialMode={screenMode === "try" ? "signup" : screenMode} cohort={screenCohort} onBack={() => window.location.assign("/")}
        onTry={screenCohort === CLINICAL_COHORT ? null : () => { setTrying(true); window.history.replaceState({}, "", APP_TRY + window.location.search); window.scrollTo(0, 0); }} />
    );
  }
  if (entry === "welcome") {
    return <ClinicalWelcome onStart={() => { dismissClinicalWelcome(window.localStorage); setEntry("ready"); }} />;
  }
  /* The study app stays unmounted until the claim returns, so its first
     entitlement read already includes the 30-day pass. */
  if (entry === "booting") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "'Archivo', system-ui, sans-serif", color: "#0e6e5c" }}>
        <p>Opening PulseRN.</p>
      </main>
    );
  }
  return <App key={session.user.id} />;
}

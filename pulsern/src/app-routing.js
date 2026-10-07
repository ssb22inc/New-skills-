export const APP_ROOT = "/app/";
export const APP_SIGN_IN = "/app/sign-in";
export const APP_SIGN_UP = "/app/sign-up";
export const APP_RESET = "/app/reset";
export const APP_SESSION_MIGRATION_KEY = "pulsern.app-path-session.v1";

export function appUrl(pathname = APP_ROOT, origin = window.location.origin) {
  return new URL(pathname, origin).toString();
}

export function authModeFromUrl(href = window.location.href) {
  const url = new URL(href);
  if (url.pathname === APP_SIGN_UP || url.searchParams.get("start") === "1") return "signup";
  if (url.pathname === APP_RESET) return "reset";
  return "signin";
}

export function isAuthCallbackUrl(href = window.location.href) {
  const url = new URL(href);
  if (["code", "token_hash", "type"].some((key) => url.searchParams.has(key))) return true;
  return /(?:^|[#&])(access_token|refresh_token|type)=/i.test(url.hash);
}

export function authCallbackAppUrl(href = window.location.href) {
  if (!isAuthCallbackUrl(href)) return null;
  const url = new URL(href);
  url.pathname = APP_ROOT;
  return url.toString();
}

export function authRedirectUrl(kind = "signin", origin = window.location.origin) {
  return appUrl(kind === "recovery" ? APP_RESET : APP_ROOT, origin);
}

export async function enforceOneTimeAppRelogin({ auth, storage, href }) {
  if (storage.getItem(APP_SESSION_MIGRATION_KEY) === "complete") return { action: "already-complete" };
  if (isAuthCallbackUrl(href)) {
    storage.setItem(APP_SESSION_MIGRATION_KEY, "complete");
    return { action: "preserved-auth-callback" };
  }

  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (data?.session) {
    const { error: signOutError } = await auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;
  }
  storage.setItem(APP_SESSION_MIGRATION_KEY, "complete");
  return { action: data?.session ? "signed-out-existing-session" : "no-existing-session" };
}

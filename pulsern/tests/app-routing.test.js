import { describe, expect, it, vi } from "vitest";
import {
  APP_SESSION_MIGRATION_KEY,
  authCallbackAppUrl,
  authModeFromUrl,
  authRedirectUrl,
  enforceOneTimeAppRelogin,
  isAuthCallbackUrl,
} from "../src/app-routing.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("/app/ routing and session migration", () => {
  it("maps app authentication paths and redirects to the www /app/ origin", () => {
    expect(authModeFromUrl("https://www.pulsern.app/app/sign-in")).toBe("signin");
    expect(authModeFromUrl("https://www.pulsern.app/app/sign-up")).toBe("signup");
    expect(authModeFromUrl("https://www.pulsern.app/app/reset")).toBe("reset");
    expect(authRedirectUrl("signin", "https://www.pulsern.app")).toBe("https://www.pulsern.app/app/");
    expect(authRedirectUrl("recovery", "https://www.pulsern.app")).toBe("https://www.pulsern.app/app/reset");
  });

  it("recognizes query and hash authentication callbacks", () => {
    expect(isAuthCallbackUrl("https://www.pulsern.app/app/?code=abc")).toBe(true);
    expect(isAuthCallbackUrl("https://www.pulsern.app/app/#access_token=abc")).toBe(true);
    expect(isAuthCallbackUrl("https://www.pulsern.app/app/")).toBe(false);
  });

  it("moves a legacy root callback to the app without changing its payload", () => {
    expect(authCallbackAppUrl("https://www.pulsern.app/?code=abc&next=study#type=recovery"))
      .toBe("https://www.pulsern.app/app/?code=abc&next=study#type=recovery");
    expect(authCallbackAppUrl("https://www.pulsern.app/?utm_source=email")).toBeNull();
  });

  it("forces one local sign-out for an existing root-era session", async () => {
    const storage = memoryStorage();
    const auth = { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }), signOut: vi.fn().mockResolvedValue({ error: null }) };
    await expect(enforceOneTimeAppRelogin({ auth, storage, href: "https://www.pulsern.app/app/" })).resolves.toEqual({ action: "signed-out-existing-session" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(storage.getItem(APP_SESSION_MIGRATION_KEY)).toBe("complete");
  });

  it("never signs out an email or OAuth callback session", async () => {
    const storage = memoryStorage();
    const auth = { getSession: vi.fn(), signOut: vi.fn() };
    await expect(enforceOneTimeAppRelogin({ auth, storage, href: "https://www.pulsern.app/app/?code=callback" })).resolves.toEqual({ action: "preserved-auth-callback" });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does not repeat the migration after completion", async () => {
    const storage = memoryStorage({ [APP_SESSION_MIGRATION_KEY]: "complete" });
    const auth = { getSession: vi.fn(), signOut: vi.fn() };
    await expect(enforceOneTimeAppRelogin({ auth, storage, href: "https://www.pulsern.app/app/" })).resolves.toEqual({ action: "already-complete" });
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});

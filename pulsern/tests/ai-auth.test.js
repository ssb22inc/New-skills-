/* The OpenRouter bill is the thing an anonymous caller can run up.
   These tests pin the door on /api/ai and /api/plan:
     - no signed-in user → 401, and fetch never leaves the process
     - a signed-in user (no subscription lookup) → the provider is called
   Free-pass and trial accounts are ordinary signed-in users, so the door
   does not ask who has paid. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, from, createClient } = vi.hoisted(() => {
  const getUser = vi.fn();
  const from = vi.fn();
  const createClient = vi.fn(() => ({ auth: { getUser }, from }));
  return { getUser, from, createClient };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import aiHandler from "../api/ai.js";
import planHandler from "../api/plan.js";
import { tokenFromRequest } from "../api/require-user.js";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY"];
const SAVED = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const fakeRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

const call = async (handler, req) => {
  const res = fakeRes();
  await handler(req, res);
  return res;
};

const signedIn = (id = "user-1") => {
  getUser.mockResolvedValue({ data: { user: { id } }, error: null });
};

const providerReply = (content) => ({
  json: async () => ({ choices: [{ message: { content } }] }),
});

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function planDays(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start.getTime());
    day.setDate(start.getDate() + i);
    return { day: iso(day), focusCat: "Pharmacology", items: 8, note: "Short and steady." };
  });
}

describe("reading the student credential", () => {
  it("takes the bearer token the study app sends", () => {
    expect(tokenFromRequest({ headers: { authorization: "Bearer session-token" } })).toBe("session-token");
  });

  it("takes the body token the rest of the API already uses", () => {
    expect(tokenFromRequest({ headers: {}, body: { token: " body-token " } })).toBe("body-token");
  });

  it("returns nothing when the caller sent nothing", () => {
    expect(tokenFromRequest({ headers: {}, body: {} })).toBe("");
    expect(tokenFromRequest({ headers: { authorization: "Bearer" }, body: {} })).toBe("");
    expect(tokenFromRequest({ headers: {}, body: { token: 123 } })).toBe("");
  });
});

describe("AI endpoints require a signed-in user", () => {
  let fetchSpy;

  beforeEach(() => {
    getUser.mockReset();
    from.mockReset();
    createClient.mockClear();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    fetchSpy = vi.fn(async () => providerReply("A signed-in explanation."));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (SAVED[key] === undefined) delete process.env[key];
      else process.env[key] = SAVED[key];
    }
  });

  it("turns an anonymous tutor call away before the provider", async () => {
    const res = await call(aiHandler, {
      method: "POST",
      headers: {},
      body: { provider: "claude", prompt: "Explain this practice item.", maxTokens: 50 },
    });
    expect(res.code).toBe(401);
    expect(res.body).toEqual({ error: "Sign in first" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("turns an empty anonymous call away with 401, not a prompt error", async () => {
    const res = await call(aiHandler, { method: "POST", headers: {}, body: {} });
    expect(res.code).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not call the provider when the token is rejected", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    const res = await call(aiHandler, {
      method: "POST",
      headers: { authorization: "Bearer not-a-session" },
      body: { provider: "deepseek", prompt: "Explain this practice item." },
    });
    expect(res.code).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith("not-a-session");
  });

  it("fails closed when auth itself errors", async () => {
    getUser.mockRejectedValue(new Error("auth down"));
    const res = await call(aiHandler, {
      method: "POST",
      headers: { authorization: "Bearer session-token" },
      body: { prompt: "Explain this practice item." },
    });
    expect(res.code).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await call(aiHandler, {
      method: "POST",
      headers: { authorization: "Bearer session-token" },
      body: { prompt: "Explain this practice item." },
    });
    expect(res.code).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("lets a signed-in user through without a subscription check", async () => {
    signedIn("trial-user");
    const res = await call(aiHandler, {
      method: "POST",
      headers: { authorization: "Bearer session-token" },
      body: { provider: "deepseek", prompt: "Explain this practice item.", maxTokens: 80, token: "body-should-not-win" },
    });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ text: "A signed-in explanation." });
    expect(from).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openrouter-key");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("deepseek/deepseek-chat");
    expect(sent.messages).toEqual([{ role: "user", content: "Explain this practice item." }]);
    expect(JSON.stringify(sent)).not.toContain("session-token");
    expect(getUser).toHaveBeenCalledWith("session-token");
  });

  it("accepts the body token when no bearer header was sent", async () => {
    signedIn();
    const res = await call(aiHandler, {
      method: "POST",
      headers: {},
      body: { provider: "claude", prompt: "Explain this practice item.", token: "body-token" },
    });
    expect(res.code).toBe(200);
    expect(getUser).toHaveBeenCalledWith("body-token");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still rejects a bad prompt after auth, without calling the provider", async () => {
    signedIn();
    const res = await call(aiHandler, {
      method: "POST",
      headers: { authorization: "Bearer session-token" },
      body: {},
    });
    expect(res.code).toBe(400);
    expect(res.body).toEqual({ error: "Bad prompt" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("turns an anonymous planner call away before the provider", async () => {
    const exam = new Date();
    exam.setDate(exam.getDate() + 40);
    const res = await call(planHandler, {
      method: "POST",
      headers: {},
      body: { examDate: iso(exam), ability: {}, today: iso(new Date()) },
    });
    expect(res.code).toBe(401);
    expect(res.body).toEqual({ error: "Sign in first" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("lets a signed-in planner call through to the provider", async () => {
    signedIn("trial-user");
    const start = new Date();
    const exam = new Date(start.getTime());
    exam.setDate(start.getDate() + 40);
    const days = planDays(start);
    fetchSpy.mockResolvedValue(providerReply(JSON.stringify({ days })));
    const res = await call(planHandler, {
      method: "POST",
      headers: { authorization: "Bearer session-token" },
      body: { examDate: iso(exam), ability: {}, dueCount: 0, answeredTotal: 0, today: iso(start) },
    });
    expect(res.code).toBe(200);
    expect(res.body.days).toHaveLength(7);
    expect(from).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openrouter-key");
    expect(init.body).not.toContain("session-token");
  });
});

// Shared door for the endpoints that spend the OpenRouter key.
// A signed-in PulseRN user is enough, including a free-pass or trial
// account. Subscription state is a product gate in the app, not this one:
// the bill risk is an anonymous caller.
// No token, a rejected token, missing Supabase config, or an auth outage
// all return null so the caller fails closed and never reaches the provider.

import { createClient } from '@supabase/supabase-js';

export function tokenFromRequest(req) {
  const headers = req?.headers || {};
  const raw = headers.authorization ?? headers.Authorization ?? '';
  const header = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
  const bearer = /^Bearer\s+(\S+)/i.exec(header)?.[1];
  if (bearer) return bearer;
  const bodyToken = req?.body?.token;
  if (typeof bodyToken === 'string' && bodyToken.trim()) return bodyToken.trim();
  return '';
}

export async function userFromRequest(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

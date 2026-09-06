/* Shared OpenRouter client for the ops factories.
   ------------------------------------------------------------------
   The three factories each carried a copy of this call, and every copy had
   the same two faults:

     1. It never checked the HTTP status or the `error` field. OpenRouter
        answers a rate limit, an exhausted balance, and an unavailable model
        with a JSON body that has no `choices`. The old code read that as an
        empty completion and reported "Empty response from <model>", which
        threw away the only useful information in the response. A run of 60
        loops could lose 46 of them to rate limiting and say nothing about it.

     2. It did not retry. Eight parallel jobs hitting one model is exactly the
        shape of traffic that earns 429s, and a single transient 429 killed a
        whole loop — two minutes of work and the tokens already spent on it.

   Retries are bounded and only cover the failures that are actually worth
   retrying: rate limits and server-side errors. A bad request or an
   authentication failure is returned immediately, because retrying it just
   wastes time and burns the same error five times.
   ------------------------------------------------------------------ */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

/* OpenRouter reserves the maximum possible cost of every in-flight request
   against the balance, so N parallel jobs asking for large completions can be
   refused with 402 while the money is still there and unspent. That 402 is
   transient — it clears as soon as the in-flight requests settle — and is a
   completely different condition from an actually empty balance, which no
   amount of waiting fixes. The message is the only thing that distinguishes
   them, so match on it. */
const isReservationLimit = (msg = "") => /in-flight|in flight/i.test(msg);

/* Signals the caller that no further attempt in this run can succeed, so a
   60-loop budget is not spent rediscovering the same fatal answer. */
export class FatalLlmError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Full jitter: without it, eight jobs that hit the same 429 all wake at the
   same moment and collide again. */
function backoffMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 60_000);
  const ceiling = Math.min(1000 * 2 ** (attempt - 1), 30_000);
  return Math.round(Math.random() * ceiling);
}

/* OpenRouter reports errors in several shapes depending on where the failure
   happened — the request, the gateway, or the upstream provider. Pull out
   whichever one is present rather than letting it fall through as "empty". */
function errorText(data, status) {
  const e = data?.error;
  const msg = typeof e === "string" ? e : e?.message ?? data?.message;
  const providerMsg = data?.choices?.[0]?.error?.message ?? e?.metadata?.raw;
  const parts = [msg, providerMsg].filter(Boolean);
  return parts.length ? parts.join(" — ") : `HTTP ${status} with no completion and no error message`;
}

export async function llm(model, prompt, maxTokens = 6000) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let r, data;
    try {
      r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (e) {
      // Network-level failure: no response at all, always worth one more try.
      lastError = new Error(`${model}: network error — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await sleep(backoffMs(attempt)); continue; }
      throw lastError;
    }

    try { data = await r.json(); } catch { data = null; }

    if (!r.ok || data?.error) {
      const detail = errorText(data, r.status);
      const err = new Error(`${model}: ${r.status} ${detail}`);

      /* A balance that is genuinely empty stops the whole run. Retrying it
         sixty times just prints the same sentence sixty times. */
      if (r.status === 402 && !isReservationLimit(detail)) {
        throw new FatalLlmError(
          `${model}: 402 out of credits — ${detail}\n` +
          `  Add credits at https://openrouter.ai/settings/credits, then re-run.`
        );
      }

      const retryable = RETRY_STATUS.has(r.status) || (r.status === 402 && isReservationLimit(detail));
      if (retryable && attempt < MAX_ATTEMPTS) {
        lastError = err;
        const wait = backoffMs(attempt, r.headers.get("retry-after"));
        console.log(`  ↻ ${model} ${r.status}; retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
        await sleep(wait);
        continue;
      }
      throw err; // 400/401/403 and the like: retrying changes nothing
    }

    const text = data?.choices?.[0]?.message?.content ?? "";
    if (text) return text;

    /* A 200 with no content. The finish reason distinguishes "the model hit
       the token ceiling" from "the provider returned nothing", which are
       different problems with different fixes. */
    const finish = data?.choices?.[0]?.finish_reason ?? "unknown";
    lastError = new Error(`${model}: empty completion (finish_reason: ${finish}, max_tokens: ${maxTokens})`);
    if (attempt < MAX_ATTEMPTS) { await sleep(backoffMs(attempt)); continue; }
    throw lastError;
  }
  throw lastError ?? new Error(`${model}: exhausted ${MAX_ATTEMPTS} attempts`);
}

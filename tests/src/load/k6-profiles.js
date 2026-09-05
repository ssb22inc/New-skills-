/**
 * BUILD §5.5 — k6 load profiles, runnable against any gateway deployment:
 *
 *   k6 run --env PROFILE=normal_day      tests/src/load/k6-profiles.js
 *   k6 run --env PROFILE=friday_spike    tests/src/load/k6-profiles.js
 *   k6 run --env PROFILE=cruise_surge    tests/src/load/k6-profiles.js
 *   k6 run --env PROFILE=viral_seller    tests/src/load/k6-profiles.js
 *
 * BASE_URL / WEBHOOK_SECRET come from the environment. Targets are the
 * §5.5 law: p95 chat response <3s under spike, zero dropped webhooks
 * (every accepted delivery must land exactly once — the queue+retry
 * suite in apps/gateway proves the exactly-once half; this proves the
 * "accepted under load" half). The in-repo tsx harness
 * (gateway-load.ts) enforces the same numbers in CI without k6.
 */
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8787';
const SECRET = __ENV.WEBHOOK_SECRET || 'mock-channel-secret';
const PROFILE = __ENV.PROFILE || 'normal_day';

// A normal day is the 1× baseline; everything else is §5.5's multiples.
const PROFILES = {
  normal_day: { rate: 5, duration: '5m', preAllocatedVUs: 20 },
  friday_spike: { rate: 100, duration: '3m', preAllocatedVUs: 200 }, // 20× messaging
  cruise_surge: { rate: 50, duration: '3m', preAllocatedVUs: 100, parish: 'St. James' }, // 10× bookings, one parish
  viral_seller: { rate: 500, duration: '2m', preAllocatedVUs: 600, seller: 'viral-1' }, // single seller 100×
};
const profile = PROFILES[PROFILE];

export const options = {
  scenarios: {
    [PROFILE]: {
      executor: 'constant-arrival-rate',
      rate: profile.rate,
      timeUnit: '1s',
      duration: profile.duration,
      preAllocatedVUs: profile.preAllocatedVUs,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // §5.5: p95 chat response <3s under spike
    http_req_failed: ['rate==0'], // zero dropped webhooks
  },
};

export default function () {
  const id = `${PROFILE}-${__VU}-${__ITER}`;
  const body = JSON.stringify({
    messages: [
      {
        id,
        channel: 'mock',
        from: `+1876555${String(__VU).padStart(4, '0')}`,
        kind: 'text',
        text:
          PROFILE === 'cruise_surge'
            ? `book 2 for saturday in ${profile.parish}`
            : PROFILE === 'viral_seller'
              ? `book with ${profile.seller}`
              : 'is saturday open?',
      },
    ],
  });
  const signature = crypto.hmac('sha256', SECRET, body, 'hex');
  const res = http.post(`${BASE_URL}/webhooks/mock`, body, {
    headers: { 'content-type': 'application/json', 'x-mock-signature': `sha256=${signature}` },
  });
  check(res, { 'accepted (2xx)': (r) => r.status >= 200 && r.status < 300 });
}

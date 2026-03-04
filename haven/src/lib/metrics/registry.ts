/**
 * Shared Prometheus registry and metric definitions.
 *
 * IMPORTANT: This module must be the single source of truth for all metrics.
 * Both the /api/metrics route handler and the withMetrics() middleware import
 * from here so they share the same Registry instance. If either file were to
 * create its own Registry, metrics would not appear in the scrape endpoint.
 */
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

// Module-level singleton — created once per Node.js process.
export const register = new Registry();

collectDefaultMetrics({ register });

// ── HTTP request metrics ──────────────────────────────────────
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// ── Business metrics ──────────────────────────────────────────
export const listingsCreated = new Counter({
  name: 'listings_created_total',
  help: 'Total number of listings created',
  registers: [register],
});

export const matchesCreated = new Counter({
  name: 'matches_created_total',
  help: 'Total number of matches created',
  registers: [register],
});

export const matchScore = new Histogram({
  name: 'match_score',
  help: 'Distribution of match scores',
  buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  registers: [register],
});

export const bookingsCreated = new Counter({
  name: 'bookings_created_total',
  help: 'Total number of bookings created',
  labelNames: ['status'],
  registers: [register],
});

export const userSignups = new Counter({
  name: 'user_signups_total',
  help: 'Total number of user signups',
  labelNames: ['type'],
  registers: [register],
});

export const listingViews = new Counter({
  name: 'listing_views_total',
  help: 'Total number of listing views',
  registers: [register],
});

export const matchActions = new Counter({
  name: 'match_actions_total',
  help: 'Match actions taken by users',
  labelNames: ['action'],
  registers: [register],
});

export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Authentication attempts',
  labelNames: ['status'],
  registers: [register],
});

export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Rate limit hits',
  labelNames: ['endpoint'],
  registers: [register],
});

export const aiRequestDuration = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI API requests',
  labelNames: ['endpoint'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [register],
});

export const paymentAmount = new Counter({
  name: 'payment_amount_total',
  help: 'Total payment amounts',
  labelNames: ['status'],
  registers: [register],
});

export const funnelStep = new Counter({
  name: 'funnel_step_total',
  help: 'Conversion funnel steps',
  labelNames: ['step'],
  registers: [register],
});

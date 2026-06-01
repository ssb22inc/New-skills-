import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

// Rate limiter using Upstash Redis
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true,
});

// Stricter rate limit for auth endpoints
const authRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 attempts per minute
  analytics: true,
});

// AI endpoints rate limit
const aiRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 AI calls per minute
  analytics: true,
});

/**
 * Extract the real client IP. Trusts only the leftmost entry of
 * X-Forwarded-For (set by the load balancer / ingress) and falls back to
 * X-Real-IP before finally defaulting to a sentinel value. Both headers are
 * normalised so a client-supplied header with extra whitespace or multiple
 * IPs can't be used to bypass per-IP rate limiting.
 */
export function getClientIp(request: NextRequest | Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // The leftmost IP is the original client; subsequent entries are proxies.
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

export async function rateLimit(
  request: NextRequest,
  type: 'default' | 'auth' | 'ai' = 'default'
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const ip = getClientIp(request);
  const identifier = `${ip}:${type}`;

  const limiter = type === 'auth' ? authRatelimit : type === 'ai' ? aiRatelimit : ratelimit;
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  return { success, limit, remaining, reset };
}

/** Generate a random per-request CSP nonce (base64url, 128 bits). */
export function generateNonce(): string {
  return randomBytes(16).toString('base64url');
}

export function securityHeaders(nonce?: string): Headers {
  const headers = new Headers();

  // Strict Transport Security
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content Security Policy
  // When a nonce is provided it is used for Next.js inline scripts via
  // 'strict-dynamic'. Without a nonce we fall back to 'self' only.
  const scriptSrc = nonce
    ? `'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`
    : `'self' https://js.stripe.com`;

  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.openai.com",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ')
  );

  // XSS Protection
  headers.set('X-XSS-Protection', '1; mode=block');

  // Content Type Options
  headers.set('X-Content-Type-Options', 'nosniff');

  // Frame Options
  headers.set('X-Frame-Options', 'DENY');

  // Referrer Policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), interest-cohort=()'
  );

  return headers;
}

export function addSecurityHeaders(response: NextResponse, nonce?: string): NextResponse {
  const headers = securityHeaders(nonce);
  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

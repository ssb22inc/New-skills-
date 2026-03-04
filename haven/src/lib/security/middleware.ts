import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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

export async function rateLimit(
  request: NextRequest,
  type: 'default' | 'auth' | 'ai' = 'default'
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const identifier = `${ip}:${type}`;

  const limiter = type === 'auth' ? authRatelimit : type === 'ai' ? aiRatelimit : ratelimit;
  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  return { success, limit, remaining, reset };
}

export function securityHeaders(): Headers {
  const headers = new Headers();

  // Strict Transport Security
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Content Security Policy
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // 'unsafe-inline' and 'unsafe-eval' removed. Use 'strict-dynamic' with per-request
      // nonces for Next.js inline scripts (pass nonce via generateMetadata / layout).
      "script-src 'self' 'strict-dynamic' https://js.stripe.com",
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

export function addSecurityHeaders(response: NextResponse): NextResponse {
  const headers = securityHeaders();
  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for development
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetAt: number }> = new Map();

  async limit(
    identifier: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || entry.resetAt < now) {
      this.requests.set(identifier, {
        count: 1,
        resetAt: now + windowMs,
      });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: now + windowMs,
      };
    }

    if (entry.count >= maxRequests) {
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: entry.resetAt,
      };
    }

    entry.count++;
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - entry.count,
      reset: entry.resetAt,
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (value.resetAt < now) {
        this.requests.delete(key);
      }
    }
  }
}

const inMemoryLimiter = new InMemoryRateLimiter();

// Cleanup old entries every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => inMemoryLimiter.cleanup(), 60000);
}

// Rate limiter configuration
const rateLimitConfig = {
  default: { requests: 100, window: 60000 }, // 100 requests per minute
  auth: { requests: 5, window: 60000 }, // 5 attempts per minute
  ai: { requests: 20, window: 60000 }, // 20 AI calls per minute
};

export async function rateLimit(
  request: NextRequest,
  type: 'default' | 'auth' | 'ai' = 'default'
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const identifier = `${ip}:${type}`;

  const config = rateLimitConfig[type];

  // Use in-memory rate limiter
  return inMemoryLimiter.limit(identifier, config.requests, config.window);
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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

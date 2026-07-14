import { describe, it, expect, vi } from 'vitest';

// Real rate limiting needs Upstash Redis; unit tests exercise the limiter
// wiring with an in-memory stand-in. HTTP-level 429 behaviour is covered by
// the k6/Artillery load tests.
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({}) },
}));

vi.mock('@upstash/ratelimit', () => {
  const counters = new Map<string, number>();

  class Ratelimit {
    static slidingWindow = (limit: number, _window: string) => limit;

    private readonly max: number;

    constructor(config: { limiter: number }) {
      this.max = config.limiter;
    }

    async limit(identifier: string) {
      const count = (counters.get(identifier) ?? 0) + 1;
      counters.set(identifier, count);
      return {
        success: count <= this.max,
        limit: this.max,
        remaining: Math.max(0, this.max - count),
        reset: 0,
      };
    }
  }

  return { Ratelimit };
});

import { rateLimit, getClientIp } from '@/lib/security/middleware';
import type { NextRequest } from 'next/server';

function fakeRequest(headers: Record<string, string>): NextRequest {
  return new Request('http://localhost/api/auth/login', { headers }) as unknown as NextRequest;
}

describe('Rate Limiting', () => {
  it('blocks after the auth limit is exceeded', async () => {
    const request = fakeRequest({ 'x-forwarded-for': '203.0.113.7' });

    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      const { success } = await rateLimit(request, 'auth');
      results.push(success);
    }

    // Auth limiter allows 5/minute; the rest must be rejected.
    expect(results.filter(Boolean).length).toBe(5);
    expect(results.slice(5).every((s) => s === false)).toBe(true);
  });

  it('reports limit metadata', async () => {
    const request = fakeRequest({ 'x-forwarded-for': '203.0.113.8' });
    const result = await rateLimit(request, 'default');

    expect(result.limit).toBeGreaterThan(0);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(typeof result.reset).toBe('number');
  });
});

describe('getClientIp', () => {
  it('uses only the leftmost X-Forwarded-For entry', () => {
    const request = fakeRequest({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1, 10.0.0.2' });
    expect(getClientIp(request)).toBe('198.51.100.1');
  });

  it('falls back to X-Real-IP', () => {
    const request = fakeRequest({ 'x-real-ip': '198.51.100.2' });
    expect(getClientIp(request)).toBe('198.51.100.2');
  });

  it('defaults to loopback when no headers are present', () => {
    const request = fakeRequest({});
    expect(getClientIp(request)).toBe('127.0.0.1');
  });
});

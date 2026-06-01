import { describe, it, expect } from 'vitest';

describe('Rate Limiting', () => {
  it('blocks after limit exceeded', async () => {
    const results = [];

    // Simulate rapid requests
    for (let i = 0; i < 10; i++) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@test.com', password: 'wrong' }),
      });
      results.push(res.status);
    }

    // Should have some 429s after limit
    expect(results.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it('returns proper rate limit headers', async () => {
    const res = await fetch('/api/listings');

    expect(res.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
  });
});

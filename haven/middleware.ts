import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { rateLimit, addSecurityHeaders } from '@/lib/security/middleware';

// Routes that use stricter (auth) rate limiting
const AUTH_ROUTES = ['/api/auth', '/(auth)/login', '/(auth)/signup', '/api/users/profile'];

// Routes that use AI rate limiting
const AI_ROUTES = ['/api/ai/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Determine rate limit type
  const rateLimitType =
    AUTH_ROUTES.some((r) => pathname.startsWith(r))
      ? 'auth'
      : AI_ROUTES.some((r) => pathname.startsWith(r))
        ? 'ai'
        : 'default';

  // Apply rate limiting on API routes only (avoids overhead on page navigations)
  if (pathname.startsWith('/api/')) {
    try {
      const { success, limit, remaining, reset } = await rateLimit(request, rateLimitType);

      if (!success) {
        const response = NextResponse.json(
          { error: 'Too many requests', retryAfter: Math.ceil((reset - Date.now()) / 1000) },
          { status: 429 }
        );
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', reset.toString());
        response.headers.set('Retry-After', Math.ceil((reset - Date.now()) / 1000).toString());
        return addSecurityHeaders(response);
      }
    } catch {
      // If rate limiting fails (e.g. Redis unavailable), allow the request through
      // rather than blocking legitimate traffic. Log for monitoring.
      console.warn('[middleware] Rate limit check failed, allowing request through');
    }
  }

  // Update Supabase auth session
  const response = await updateSession(request);

  // Apply security headers to all responses
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

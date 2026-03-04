import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { rateLimit, addSecurityHeaders } from '@/lib/security/middleware';
import { randomUUID } from 'crypto';

// Routes that use stricter (auth) rate limiting
const AUTH_ROUTES = ['/api/auth', '/(auth)/login', '/(auth)/signup', '/api/users/profile'];

// Routes that use AI rate limiting
const AI_ROUTES = ['/api/ai/'];

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://haven.app',
  'https://haven.app',
  'https://www.haven.app',
];

function handleCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const preflight = new NextResponse(null, { status: 204 });
    return handleCors(request, addSecurityHeaders(preflight));
  }

  // Attach or propagate a request ID for distributed tracing
  const requestId = request.headers.get('x-request-id') ?? randomUUID();

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
        response.headers.set('X-Request-ID', requestId);
        return handleCors(request, addSecurityHeaders(response));
      }
    } catch (err) {
      // Rate limiting is unavailable (Redis down). Fail CLOSED for auth and AI
      // endpoints to prevent abuse; fail OPEN for default API routes to avoid
      // blocking all traffic during an infrastructure outage.
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'rate_limit_unavailable',
          path: pathname,
          rateLimitType,
          error: err instanceof Error ? err.message : String(err),
          requestId,
          ts: new Date().toISOString(),
        })
      );

      if (rateLimitType === 'auth' || rateLimitType === 'ai') {
        const response = NextResponse.json(
          { error: 'Service temporarily unavailable. Please retry in a few moments.' },
          { status: 503 }
        );
        response.headers.set('Retry-After', '30');
        response.headers.set('X-Request-ID', requestId);
        return handleCors(request, addSecurityHeaders(response));
      }
      // Default routes: allow through but log for alerting (Redis recovery expected)
    }
  }

  // Update Supabase auth session
  const response = await updateSession(request);

  // Attach request ID to all responses for client-side correlation
  response.headers.set('X-Request-ID', requestId);

  return handleCors(request, addSecurityHeaders(response));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

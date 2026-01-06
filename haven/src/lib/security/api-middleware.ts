import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, addSecurityHeaders } from './middleware';
import { validateCsrfToken } from './csrf';
import { authenticateRequest } from './auth';
import { logSecurityEvent } from './audit';

export type ApiHandler = (
  request: NextRequest,
  context: { params: Record<string, string>; user?: any }
) => Promise<NextResponse>;

interface MiddlewareOptions {
  requireAuth?: boolean;
  rateLimit?: 'default' | 'auth' | 'ai';
  validateCsrf?: boolean;
  allowedMethods?: string[];
}

export function withSecurity(handler: ApiHandler, options: MiddlewareOptions = {}) {
  return async (request: NextRequest, context: { params: Record<string, string> }) => {
    try {
      // Method check
      if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
        );
      }

      // Rate limiting
      const rateLimitType = options.rateLimit || 'default';
      const { success, limit, remaining, reset } = await rateLimit(request, rateLimitType);

      if (!success) {
        await logSecurityEvent('security.rate_limit', null, request, {
          limit,
          path: request.nextUrl.pathname,
        });

        const response = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        response.headers.set('X-RateLimit-Limit', limit.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', reset.toString());
        response.headers.set('Retry-After', Math.ceil((reset - Date.now()) / 1000).toString());
        return addSecurityHeaders(response);
      }

      // CSRF validation for mutations
      if (options.validateCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const validCsrf = await validateCsrfToken(request);
        if (!validCsrf) {
          return addSecurityHeaders(
            NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
          );
        }
      }

      // Authentication
      let user = null;
      if (options.requireAuth) {
        const authResult = await authenticateRequest(request);
        if (!authResult.authenticated) {
          return addSecurityHeaders(
            NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
          );
        }
        user = authResult.user;
      }

      // Call handler
      const response = await handler(request, { ...context, user });

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', limit.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', reset.toString());

      return addSecurityHeaders(response);
    } catch (error) {
      console.error('API Error:', error);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      );
    }
  };
}

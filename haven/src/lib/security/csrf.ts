import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = '__Host-csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function setCsrfCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, hashToken(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const storedHash = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const submittedToken = request.headers.get(CSRF_HEADER_NAME);

  if (!storedHash || !submittedToken) {
    return false;
  }

  const submittedHash = hashToken(submittedToken);
  return timingSafeEqual(storedHash, submittedHash);
}

// Constant-time comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}

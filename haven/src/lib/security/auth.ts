import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me');

// Create JWT token
export async function createToken(payload: Record<string, unknown>, expiresIn: string = '1h'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

// Verify JWT token
export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Authenticate request
export async function authenticateRequest(request: NextRequest): Promise<{
  authenticated: boolean;
  user: any | null;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { authenticated: false, user: null, error: 'Not authenticated' };
    }

    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, user: null, error: 'Authentication failed' };
  }
}

// Check if user owns resource
export async function authorizeResourceAccess(
  userId: string,
  resourceType: 'listing' | 'booking' | 'profile',
  resourceId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  switch (resourceType) {
    case 'listing':
      const { data: listing } = await supabase
        .from('listings')
        .select('user_id')
        .eq('id', resourceId)
        .single();
      return listing?.user_id === userId;

    case 'booking':
      const { data: booking } = await supabase
        .from('bookings')
        .select('seeker_id, landlord_id')
        .eq('id', resourceId)
        .single();
      return booking?.seeker_id === userId || booking?.landlord_id === userId;

    case 'profile':
      return resourceId === userId;

    default:
      return false;
  }
}

// Role-based access control
export type Role = 'user' | 'landlord' | 'admin' | 'moderator';

export const rolePermissions: Record<Role, string[]> = {
  user: ['read:listings', 'read:matches', 'write:profile', 'write:messages'],
  landlord: ['read:listings', 'write:listings', 'read:bookings', 'write:bookings', 'read:matches'],
  moderator: ['read:all', 'moderate:listings', 'moderate:reviews'],
  admin: ['*'],
};

export function hasPermission(userRole: Role, permission: string): boolean {
  const permissions = rolePermissions[userRole];
  return permissions.includes('*') || permissions.includes(permission);
}

// Session management
export async function invalidateAllSessions(userId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.admin.signOut(userId, 'global');
}

// Password strength checker
export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters');

  if (password.length >= 12) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push('Add special characters');

  // Check for common patterns
  const commonPatterns = ['password', '123456', 'qwerty', 'admin'];
  if (commonPatterns.some((p) => password.toLowerCase().includes(p))) {
    score = Math.max(0, score - 2);
    feedback.push('Avoid common password patterns');
  }

  return { score, feedback };
}

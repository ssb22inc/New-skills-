import { describe, it, expect } from 'vitest';
import { checkPasswordStrength, hasPermission } from '@/lib/security/auth';

describe('Password Strength', () => {
  it('rejects weak passwords', () => {
    const weak = checkPasswordStrength('password');
    expect(weak.score).toBeLessThan(3);
    expect(weak.feedback.length).toBeGreaterThan(0);
  });

  it('accepts strong passwords', () => {
    const strong = checkPasswordStrength('MyStr0ng!P@ssw0rd');
    expect(strong.score).toBeGreaterThanOrEqual(5);
  });

  it('detects common patterns', () => {
    const common = checkPasswordStrength('Password123');
    expect(common.feedback).toContain('Avoid common password patterns');
  });
});

describe('Role Permissions', () => {
  it('user has limited permissions', () => {
    expect(hasPermission('user', 'read:listings')).toBe(true);
    expect(hasPermission('user', 'write:listings')).toBe(false);
    expect(hasPermission('user', 'admin.action')).toBe(false);
  });

  it('landlord has listing permissions', () => {
    expect(hasPermission('landlord', 'write:listings')).toBe(true);
    expect(hasPermission('landlord', 'admin.action')).toBe(false);
  });

  it('admin has all permissions', () => {
    expect(hasPermission('admin', 'anything')).toBe(true);
    expect(hasPermission('admin', 'write:listings')).toBe(true);
    expect(hasPermission('admin', 'admin.action')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { checkPasswordStrength, hasPermission, type Role } from '@/lib/security/auth';

describe('Authentication & Authorization', () => {
  describe('Password Strength', () => {
    it('should reject weak passwords', () => {
      const weak = checkPasswordStrength('password');
      expect(weak.score).toBeLessThan(3);
      expect(weak.feedback.length).toBeGreaterThan(0);
    });

    it('should reject short passwords', () => {
      const short = checkPasswordStrength('Pass1!');
      expect(short.score).toBeLessThanOrEqual(4);
      expect(short.feedback).toContain('Password should be at least 8 characters');
    });

    it('should accept strong passwords', () => {
      const strong = checkPasswordStrength('MyStr0ng!P@ssw0rd');
      expect(strong.score).toBeGreaterThanOrEqual(5);
    });

    it('should detect common patterns', () => {
      const common = checkPasswordStrength('Password123');
      expect(common.feedback).toContain('Avoid common password patterns');
    });

    it('should require uppercase letters', () => {
      const noUpper = checkPasswordStrength('mypassword123');
      expect(noUpper.feedback).toContain('Add uppercase letters');
    });

    it('should require lowercase letters', () => {
      const noLower = checkPasswordStrength('MYPASSWORD123');
      expect(noLower.feedback).toContain('Add lowercase letters');
    });

    it('should require numbers', () => {
      const noNumbers = checkPasswordStrength('MyPassword');
      expect(noNumbers.feedback).toContain('Add numbers');
    });

    it('should suggest special characters', () => {
      const noSpecial = checkPasswordStrength('MyPassword123');
      expect(noSpecial.feedback).toContain('Add special characters');
    });

    it('should give higher scores to longer passwords', () => {
      const short = checkPasswordStrength('Pass123!');
      const long = checkPasswordStrength('MyVeryLongP@ssw0rd123');
      expect(long.score).toBeGreaterThan(short.score);
    });
  });

  describe('Role-Based Permissions', () => {
    it('user should have limited permissions', () => {
      expect(hasPermission('user', 'read:listings')).toBe(true);
      expect(hasPermission('user', 'write:listings')).toBe(false);
      expect(hasPermission('user', 'moderate:listings')).toBe(false);
    });

    it('landlord should have listing permissions', () => {
      expect(hasPermission('landlord', 'read:listings')).toBe(true);
      expect(hasPermission('landlord', 'write:listings')).toBe(true);
      expect(hasPermission('landlord', 'read:bookings')).toBe(true);
    });

    it('moderator should have moderation permissions', () => {
      expect(hasPermission('moderator', 'read:all')).toBe(true);
      expect(hasPermission('moderator', 'moderate:listings')).toBe(true);
      expect(hasPermission('moderator', 'moderate:reviews')).toBe(true);
    });

    it('admin should have all permissions', () => {
      const permissions = [
        'read:listings',
        'write:listings',
        'delete:listings',
        'moderate:all',
        'admin:users',
        'any:random:permission',
      ];

      permissions.forEach((permission) => {
        expect(hasPermission('admin', permission)).toBe(true);
      });
    });

    it('should deny permissions not in role', () => {
      expect(hasPermission('user', 'delete:listings')).toBe(false);
      expect(hasPermission('landlord', 'admin:users')).toBe(false);
      expect(hasPermission('moderator', 'admin:users')).toBe(false);
    });
  });

  describe('Permission Edge Cases', () => {
    it('should handle empty permission strings', () => {
      expect(hasPermission('user', '')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(hasPermission('user', 'READ:LISTINGS')).toBe(false);
      expect(hasPermission('user', 'read:listings')).toBe(true);
    });
  });
});

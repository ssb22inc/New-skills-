import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeHtml,
  sanitizeEmail,
  sanitizeUrl,
  escapeForLike,
  sanitizeSearchTerm,
  validateFileUpload,
} from '@/lib/security/sanitize';

describe('Input Sanitization', () => {
  describe('XSS Prevention', () => {
    it('should remove script tags from text', () => {
      const dirty = '<script>alert("xss")</script>Hello';
      expect(sanitizeText(dirty)).toBe('Hello');
    });

    it('should remove event handlers', () => {
      const dirty = '<img src="x" onerror="alert(1)">';
      expect(sanitizeHtml(dirty)).toBe('');
    });

    it('should remove javascript: URLs', () => {
      const dirty = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeHtml(dirty);
      // DOMPurify removes the link but keeps the text content
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('<a');
    });

    it('should allow safe HTML in sanitizeHtml', () => {
      const safe = '<p><strong>Hello</strong> <em>World</em></p>';
      expect(sanitizeHtml(safe)).toBe(safe);
    });

    it('should remove dangerous attributes', () => {
      const dirty = '<p onclick="alert(1)">Test</p>';
      expect(sanitizeHtml(dirty)).toBe('<p>Test</p>');
    });

    it('should handle nested script tags', () => {
      const dirty = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      const result = sanitizeText(dirty);
      // DOMPurify removes all script tags
      expect(result).not.toContain('<script');
      expect(result).not.toContain('</script');
      expect(result).not.toContain('<scr');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should escape LIKE special characters', () => {
      expect(escapeForLike('100%')).toBe('100\\%');
      expect(escapeForLike('test_user')).toBe('test\\_user');
      expect(escapeForLike('back\\slash')).toBe('back\\\\slash');
    });

    it('should not modify SQL injection attempts in escapeForLike', () => {
      // escapeForLike only escapes LIKE wildcards
      // Parameterized queries should be used for actual SQL injection prevention
      const malicious = "'; DROP TABLE users;--";
      expect(escapeForLike(malicious)).toBe(malicious);
    });
  });

  describe('Email Sanitization', () => {
    it('should lowercase and trim emails', () => {
      expect(sanitizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
    });

    it('should handle special email formats', () => {
      expect(sanitizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
    });
  });

  describe('URL Sanitization', () => {
    it('should allow valid HTTP URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('should allow valid HTTPS URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('should reject javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('should reject data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('should reject malformed URLs', () => {
      expect(sanitizeUrl('not a url')).toBeNull();
    });
  });

  describe('Search Term Sanitization', () => {
    it('should remove dangerous characters', () => {
      const result = sanitizeSearchTerm('<script>alert(1)</script>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should limit length', () => {
      const longTerm = 'a'.repeat(200);
      expect(sanitizeSearchTerm(longTerm).length).toBeLessThanOrEqual(100);
    });

    it('should trim whitespace', () => {
      expect(sanitizeSearchTerm('  test  ')).toBe('test');
    });
  });

  describe('File Upload Validation', () => {
    it('should accept valid image files', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = validateFileUpload(file);
      expect(result.valid).toBe(true);
    });

    it('should reject files that are too large', () => {
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });
      const result = validateFileUpload(largeFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('size');
    });

    it('should reject invalid file types', () => {
      const file = new File([''], 'test.exe', { type: 'application/exe' });
      const result = validateFileUpload(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should reject dangerous file extensions', () => {
      const file = new File([''], 'image.php.jpg', { type: 'image/jpeg' });
      const result = validateFileUpload(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous');
    });
  });
});

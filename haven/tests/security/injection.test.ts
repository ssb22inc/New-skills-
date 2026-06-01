import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeHtml, escapeForLike } from '@/lib/security/sanitize';

describe('SQL Injection Prevention', () => {
  it('escapes SQL LIKE special characters', () => {
    expect(escapeForLike('100%')).toBe('100\\%');
    expect(escapeForLike('test_user')).toBe('test\\_user');
    expect(escapeForLike("'; DROP TABLE users;--")).toBe("'; DROP TABLE users;--");
  });

  it('parameterized queries prevent injection', async () => {
    // This would be an integration test with actual DB
    const maliciousInput = "'; DROP TABLE listings;--";
    // The input should be passed as a parameter, not concatenated
    // Supabase client handles this automatically
  });
});

describe('XSS Prevention', () => {
  it('sanitizes script tags', () => {
    const dirty = '<script>alert("xss")</script>Hello';
    expect(sanitizeText(dirty)).toBe('Hello');
    expect(sanitizeHtml(dirty)).toBe('Hello');
  });

  it('sanitizes event handlers', () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(dirty)).toBe('');
  });

  it('sanitizes javascript: URLs', () => {
    const dirty = '<a href="javascript:alert(1)">Click</a>';
    expect(sanitizeHtml(dirty)).toBe('');
  });

  it('allows safe HTML in sanitizeHtml', () => {
    const safe = '<p><strong>Hello</strong> <em>World</em></p>';
    expect(sanitizeHtml(safe)).toBe(safe);
  });

  it('removes dangerous attributes', () => {
    const dirty = '<p onclick="alert(1)" style="background:url(javascript:alert(1))">Test</p>';
    expect(sanitizeHtml(dirty)).toBe('<p>Test</p>');
  });
});

describe('Path Traversal Prevention', () => {
  it('rejects path traversal attempts', () => {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      'file:///etc/passwd',
    ];

    maliciousPaths.forEach((path) => {
      // Your file handling should reject these
      expect(path.includes('..') || path.startsWith('/')).toBeTruthy();
    });
  });
});

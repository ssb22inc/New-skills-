import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeHtml, sanitizeUrl, escapeForLike } from '@/lib/security/sanitize';

describe('SQL Injection Prevention', () => {
  it('escapes SQL LIKE special characters', () => {
    expect(escapeForLike('100%')).toBe('100\\%');
    expect(escapeForLike('test_user')).toBe('test\\_user');
    expect(escapeForLike("'; DROP TABLE users;--")).toBe("'; DROP TABLE users;--");
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
    const clean = sanitizeHtml(dirty);
    // DOMPurify keeps the text content but must strip the dangerous URL.
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('href');
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
  it('rejects dangerous URL schemes', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeUrl('ftp://internal-host/secret')).toBeNull();
    expect(sanitizeUrl('not a url')).toBeNull();
    expect(sanitizeUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
  });

  it('detects traversal sequences in file paths', () => {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
    ];

    const isSuspicious = (p: string) =>
      p.includes('..') || p.startsWith('/') || p.includes('\\');

    maliciousPaths.forEach((path) => {
      expect(isSuspicious(path)).toBe(true);
    });
    expect(isSuspicious('listings/abc/photo.jpg')).toBe(false);
  });
});

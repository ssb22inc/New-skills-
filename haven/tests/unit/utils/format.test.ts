import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatRelativeTime, formatPhoneNumber, slugify, truncate } from '@/lib/utils/format';

describe('formatCurrency', () => {
  it('formats positive numbers correctly', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(2500)).toBe('$2,500');
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('rounds decimal values', () => {
    expect(formatCurrency(1999.99)).toBe('$2,000');
    expect(formatCurrency(1999.49)).toBe('$1,999');
  });
});

describe('formatDate', () => {
  it('formats date strings correctly', () => {
    expect(formatDate('2024-01-15')).toMatch(/Jan 15, 2024/);
  });

  it('formats Date objects correctly', () => {
    expect(formatDate(new Date('2024-06-20'))).toMatch(/Jun 20, 2024/);
  });

  it('accepts custom options', () => {
    const result = formatDate('2024-01-15', { month: 'long' });
    expect(result).toMatch(/January/);
  });
});

describe('formatRelativeTime', () => {
  it('returns "Just now" for recent times', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('Just now');
  });

  it('returns minutes for times under an hour', () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(formatRelativeTime(thirtyMinsAgo)).toBe('30m ago');
  });

  it('returns hours for times under a day', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(formatRelativeTime(fiveHoursAgo)).toBe('5h ago');
  });

  it('returns days for times under a week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
  });
});

describe('formatPhoneNumber', () => {
  it('formats 10-digit numbers', () => {
    expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
  });

  it('returns original for non-standard formats', () => {
    expect(formatPhoneNumber('123')).toBe('123');
    expect(formatPhoneNumber('+1-234-567-8900')).toBe('+1-234-567-8900');
  });
});

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('Test   Multiple   Spaces')).toBe('test-multiple-spaces');
  });

  it('removes leading/trailing hyphens', () => {
    expect(slugify('  Hello  ')).toBe('hello');
  });
});

describe('truncate', () => {
  it('returns original if under limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('this is a long string', 10)).toBe('this is a...');
  });

  it('handles edge cases', () => {
    expect(truncate('', 10)).toBe('');
    expect(truncate('exact', 5)).toBe('exact');
  });
});

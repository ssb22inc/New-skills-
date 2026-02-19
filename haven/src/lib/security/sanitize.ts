import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

// Sanitize HTML content
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  });
}

// Sanitize plain text (remove all HTML)
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Sanitize and validate email
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Sanitize phone number
export function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+\-() ]/g, '');
}

// Sanitize URL
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

// SQL injection prevention - parameterized queries helper
export function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

// Create sanitized Zod schemas
export const sanitizedString = (maxLength: number = 1000) =>
  z.string().max(maxLength).transform(sanitizeText);

export const sanitizedEmail = z.string().email().transform(sanitizeEmail);

export const sanitizedHtmlString = (maxLength: number = 10000) =>
  z.string().max(maxLength).transform(sanitizeHtml);

// Validate and sanitize listing input
export const sanitizedListingInput = z.object({
  title: sanitizedString(100),
  description: sanitizedHtmlString(5000),
  address_line1: sanitizedString(200),
  address_line2: sanitizedString(200).optional(),
  city: sanitizedString(100),
  state: z.string().length(2).toUpperCase(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/),
  price_monthly: z.number().int().min(100).max(100000),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0.5).max(20),
});

// Validate file upload
export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number;
    allowedTypes?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const { maxSize = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] } =
    options;

  if (file.size > maxSize) {
    return { valid: false, error: `File size exceeds ${maxSize / 1024 / 1024}MB limit` };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} not allowed` };
  }

  // Check for malicious file extensions hidden in name
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.html'];
  const lowercaseName = file.name.toLowerCase();
  if (dangerousExtensions.some((ext) => lowercaseName.includes(ext))) {
    return { valid: false, error: 'Potentially dangerous file detected' };
  }

  return { valid: true };
}

// Sanitize search input to prevent injection
export function sanitizeSearchTerm(term: string): string {
  // Remove special characters that could be used in injection attacks
  return term
    .trim()
    .replace(/[<>\"';]/g, '')
    .substring(0, 100); // Limit length
}

// Validate and sanitize JSON input
export function sanitizeJsonInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return sanitizeText(input);
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeJsonInput);
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeText(key)] = sanitizeJsonInput(value);
    }
    return sanitized;
  }
  return input;
}

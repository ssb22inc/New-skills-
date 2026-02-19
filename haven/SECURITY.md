# Security Documentation

This document outlines the security architecture, best practices, and guidelines for the Haven application.

## Table of Contents

- [Security Overview](#security-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [Rate Limiting](#rate-limiting)
- [CSRF Protection](#csrf-protection)
- [Encryption & Hashing](#encryption--hashing)
- [Audit Logging](#audit-logging)
- [Security Headers](#security-headers)
- [API Security](#api-security)
- [File Upload Security](#file-upload-security)
- [Security Testing](#security-testing)
- [Incident Response](#incident-response)
- [Security Checklist](#security-checklist)

---

## Security Overview

Haven implements defense-in-depth security with multiple layers:

1. **Network Layer**: HTTPS/TLS, security headers, CORS
2. **Application Layer**: Input validation, rate limiting, CSRF protection
3. **Data Layer**: Encryption at rest, secure sessions, password hashing
4. **Monitoring Layer**: Audit logging, security event tracking

## Authentication & Authorization

### Password Security

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Recommended: special characters

**Password Storage:**
- Passwords are hashed using Argon2id
- Parameters: memory=64MB, iterations=3, parallelism=4
- Never stored in plain text

**Implementation:**
```typescript
import { checkPasswordStrength } from '@/lib/security/auth';

const { score, feedback } = checkPasswordStrength(password);
if (score < 4) {
  return { error: 'Password too weak', feedback };
}
```

### Role-Based Access Control (RBAC)

**Roles:**
- `user`: Basic read access, profile management
- `landlord`: Create/manage listings, view bookings
- `moderator`: Content moderation, review management
- `admin`: Full system access

**Implementation:**
```typescript
import { hasPermission, getUserRole } from '@/lib/security/auth';

const userRole = await getUserRole(userId);
if (!hasPermission(userRole, 'write:listings')) {
  return { error: 'Insufficient permissions' };
}
```

### Resource Authorization

```typescript
import { authorizeResourceAccess } from '@/lib/security/auth';

const canAccess = await authorizeResourceAccess(userId, 'listing', listingId);
if (!canAccess) {
  return { error: 'Unauthorized' };
}
```

---

## Input Validation & Sanitization

### XSS Prevention

All user input is sanitized before rendering:

```typescript
import { sanitizeText, sanitizeHtml } from '@/lib/security/sanitize';

// Remove all HTML
const cleanText = sanitizeText(userInput);

// Allow safe HTML only
const cleanHtml = sanitizeHtml(userInput);
```

**Allowed HTML tags in sanitizeHtml:**
- `<b>`, `<i>`, `<em>`, `<strong>`, `<p>`, `<br>`, `<ul>`, `<ol>`, `<li>`

### SQL Injection Prevention

**Always use parameterized queries:**

```typescript
// ✅ GOOD: Parameterized query (Supabase handles escaping)
const { data } = await supabase
  .from('listings')
  .select('*')
  .eq('city', userInput);

// ❌ BAD: String concatenation
const query = `SELECT * FROM listings WHERE city = '${userInput}'`;
```

**For LIKE queries:**

```typescript
import { escapeForLike } from '@/lib/security/sanitize';

const safeTerm = escapeForLike(searchTerm);
const { data } = await supabase
  .from('listings')
  .select('*')
  .ilike('title', `%${safeTerm}%`);
```

### Zod Schema Validation

```typescript
import { sanitizedListingInput } from '@/lib/security/sanitize';

const result = sanitizedListingInput.safeParse(input);
if (!result.success) {
  return { error: 'Validation failed', details: result.error };
}
```

---

## Rate Limiting

### Configuration

**Default Limits:**
- Standard endpoints: 100 requests/minute
- Auth endpoints: 5 requests/minute
- AI endpoints: 20 requests/minute

### Usage

```typescript
import { withSecurity } from '@/lib/security/api-middleware';

export const POST = withSecurity(
  async (request, { user }) => {
    // Handler code
  },
  {
    requireAuth: true,
    rateLimit: 'auth',
  }
);
```

### Rate Limit Headers

Responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets
- `Retry-After`: Seconds to wait (on 429 responses)

---

## CSRF Protection

### Token Generation

```typescript
import { generateCsrfToken, setCsrfCookie } from '@/lib/security/csrf';

const token = generateCsrfToken();
await setCsrfCookie(token);
```

### Token Validation

```typescript
import { validateCsrfToken } from '@/lib/security/csrf';

if (!await validateCsrfToken(request)) {
  return { error: 'Invalid CSRF token' };
}
```

### API Integration

```typescript
export const POST = withSecurity(
  async (request, { user }) => {
    // Handler code
  },
  {
    requireAuth: true,
    validateCsrf: true,
  }
);
```

### Client-Side Usage

```typescript
// Get CSRF token from cookie
const csrfToken = getCsrfToken();

// Include in requests
fetch('/api/listings', {
  method: 'POST',
  headers: {
    'x-csrf-token': csrfToken,
  },
  body: JSON.stringify(data),
});
```

---

## Encryption & Hashing

### Symmetric Encryption

For encrypting sensitive data at rest:

```typescript
import { encrypt, decrypt } from '@/lib/security/encryption';

const encrypted = await encrypt(sensitiveData, secretKey);
// Store encrypted data

const decrypted = await decrypt(encrypted, secretKey);
```

### Password Hashing

```typescript
import { hashSensitiveData, verifyHash } from '@/lib/security/encryption';

// Hash password
const hash = await hashSensitiveData(password);

// Verify password
const isValid = await verifyHash(password, hash);
```

### Data Masking

For displaying sensitive data:

```typescript
import { maskEmail, maskPhone } from '@/lib/security/encryption';

const maskedEmail = maskEmail('john.doe@example.com');
// Output: j*****e@example.com

const maskedPhone = maskPhone('1234567890');
// Output: ******7890
```

---

## Audit Logging

### Event Types

- **Auth Events**: login, logout, failed_login, password_change
- **Resource Events**: create, update, delete, publish
- **Security Events**: rate_limit, suspicious_activity
- **Payment Events**: success, failed

### Logging Auth Events

```typescript
import { logAuthEvent } from '@/lib/security/audit';

await logAuthEvent('auth.login', userId, request, true, {
  method: 'email',
});
```

### Logging Resource Events

```typescript
import { logResourceEvent } from '@/lib/security/audit';

await logResourceEvent(
  'listing.create',
  userId,
  'listing',
  listingId,
  request,
  true
);
```

### Logging Security Events

```typescript
import { logSecurityEvent } from '@/lib/security/audit';

await logSecurityEvent('security.rate_limit', null, request, {
  limit: 100,
  path: '/api/listings',
});
```

### Audit Log Storage

Logs are stored in the `audit_logs` table with:
- Automatic batching (50 entries)
- 5-second flush interval
- 90-day retention for non-critical logs
- Permanent retention for critical events

---

## Security Headers

### Implemented Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: [policy]
X-XSS-Protection: 1; mode=block
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()
```

### Content Security Policy

- `default-src 'self'`: Only load resources from same origin
- `script-src`: Self + Stripe + inline (evaluated)
- `style-src`: Self + Google Fonts + inline
- `img-src`: Self + Supabase + Stripe + data URIs
- `connect-src`: Self + Supabase + Stripe + OpenAI
- `frame-ancestors 'none'`: Prevent clickjacking

---

## API Security

### Secure Route Pattern

```typescript
import { withSecurity } from '@/lib/security/api-middleware';

export const POST = withSecurity(
  async (request, { user, params }) => {
    // Validate input
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      );
    }

    // Check authorization
    const canAccess = await authorizeResourceAccess(
      user.id,
      'listing',
      params.id
    );

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Process request
    // ...

    // Log success
    await logResourceEvent(
      'listing.update',
      user.id,
      'listing',
      params.id,
      request,
      true
    );

    return NextResponse.json(data);
  },
  {
    requireAuth: true,
    validateCsrf: true,
    rateLimit: 'default',
    allowedMethods: ['POST'],
  }
);
```

---

## File Upload Security

### Validation

```typescript
import { validateFileUpload } from '@/lib/security/sanitize';

const result = validateFileUpload(file, {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
});

if (!result.valid) {
  return { error: result.error };
}
```

### Security Checks

- ✅ File size limits
- ✅ MIME type validation
- ✅ File extension validation
- ✅ Dangerous extension detection
- ✅ Content-Type verification

**Blocked Extensions:**
- `.exe`, `.bat`, `.cmd`, `.sh`
- `.php`, `.js`, `.html`
- Any executable or script file

---

## Security Testing

### Running Security Tests

```bash
# All security tests
npm test tests/security

# Specific test suite
npm test tests/security/sanitize.test.ts
npm test tests/security/auth.test.ts
npm test tests/security/encryption.test.ts
```

### Test Coverage

- ✅ XSS prevention
- ✅ SQL injection prevention
- ✅ CSRF protection
- ✅ Password strength validation
- ✅ Role-based permissions
- ✅ Data encryption/decryption
- ✅ Input sanitization
- ✅ File upload validation

---

## Incident Response

### Security Incident Procedure

1. **Detection**: Monitor audit logs and alerts
2. **Containment**: Rate limit, block IPs, revoke sessions
3. **Investigation**: Review audit logs, analyze attack
4. **Remediation**: Fix vulnerability, deploy patches
5. **Recovery**: Restore services, verify security
6. **Post-Mortem**: Document incident, improve processes

### Contact

For security issues, contact: [security@haven.com](mailto:security@haven.com)

### Vulnerability Disclosure

We practice responsible disclosure. Please report security vulnerabilities privately before public disclosure.

---

## Security Checklist

### Pre-Deployment

- [ ] All environment variables secured
- [ ] HTTPS/TLS configured
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] CSRF protection enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] XSS prevention verified
- [ ] File upload validation enabled
- [ ] Audit logging configured
- [ ] Password policy enforced
- [ ] RBAC implemented
- [ ] Security tests passing
- [ ] Dependencies scanned (`npm audit`)
- [ ] Sensitive data encrypted
- [ ] Error messages sanitized

### Regular Maintenance

- [ ] Review audit logs weekly
- [ ] Update dependencies monthly
- [ ] Run security scans quarterly
- [ ] Review access permissions quarterly
- [ ] Rotate secrets annually
- [ ] Security training for team
- [ ] Incident response drills

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)

---

## Version History

- **v1.0** (2026-01): Initial security implementation
  - Rate limiting
  - CSRF protection
  - Input sanitization
  - Audit logging
  - Encryption utilities
  - RBAC system

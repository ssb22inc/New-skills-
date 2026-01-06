# Security Module

This directory contains the core security infrastructure for the Haven application.

## Files

### `middleware.ts`
- Rate limiting (in-memory)
- Security headers
- Header injection prevention

### `csrf.ts`
- CSRF token generation and validation
- Timing-safe comparison
- Cookie-based token storage

### `sanitize.ts`
- XSS prevention (HTML sanitization)
- SQL injection prevention (LIKE escaping)
- Input validation and cleaning
- File upload validation
- Zod schema helpers

### `encryption.ts`
- AES-256-GCM symmetric encryption
- Argon2id password hashing
- Data masking for logs/display
- Secure token generation

### `auth.ts`
- JWT token creation/verification
- Request authentication
- Resource authorization
- Role-based access control (RBAC)
- Password strength validation

### `audit.ts`
- Security event logging
- Batch logging with auto-flush
- Audit trail for compliance
- Event severity levels

### `api-middleware.ts`
- Unified security wrapper for API routes
- Combines all security features
- Configurable per-endpoint

### `config.ts`
- Centralized security configuration
- Rate limits, policies, and settings

## Quick Start

### Secure an API Route

```typescript
import { withSecurity } from '@/lib/security/api-middleware';

export const POST = withSecurity(
  async (request, { user }) => {
    // Your handler code
    return NextResponse.json({ success: true });
  },
  {
    requireAuth: true,
    rateLimit: 'default',
    validateCsrf: true,
  }
);
```

### Sanitize User Input

```typescript
import { sanitizeText, sanitizedListingInput } from '@/lib/security/sanitize';

const clean = sanitizeText(userInput);

const result = sanitizedListingInput.safeParse(data);
if (!result.success) {
  return { error: 'Invalid input' };
}
```

### Hash Passwords

```typescript
import { hashSensitiveData, verifyHash } from '@/lib/security/encryption';

const hash = await hashSensitiveData(password);
const isValid = await verifyHash(password, hash);
```

### Check Permissions

```typescript
import { hasPermission, getUserRole } from '@/lib/security/auth';

const role = await getUserRole(userId);
if (!hasPermission(role, 'write:listings')) {
  return { error: 'Unauthorized' };
}
```

### Log Security Events

```typescript
import { logAuthEvent, logResourceEvent } from '@/lib/security/audit';

await logAuthEvent('auth.login', userId, request, true);
await logResourceEvent('listing.create', userId, 'listing', id, request, true);
```

## Testing

```bash
npm test tests/security
```

## Documentation

See [SECURITY.md](../../../SECURITY.md) for comprehensive security documentation.

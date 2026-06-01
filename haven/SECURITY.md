# Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Email**: security@haven.app
2. **Subject**: [SECURITY] Brief description
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Resolution Timeline**: Based on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release

### Bug Bounty Program

We offer rewards for responsibly disclosed vulnerabilities:

| Severity | Reward |
|----------|--------|
| Critical | $1,000 - $5,000 |
| High | $500 - $1,000 |
| Medium | $100 - $500 |
| Low | $50 - $100 |

## Security Measures

### Authentication
- Argon2id password hashing
- Rate limiting on auth endpoints
- Session management with secure cookies
- Optional 2FA support

### Data Protection
- AES-256-GCM encryption for sensitive data
- TLS 1.3 for data in transit
- Database encryption at rest
- PII masking in logs

### Infrastructure
- WAF protection
- DDoS mitigation
- Regular security audits
- Automated vulnerability scanning

### Compliance
- GDPR compliant
- CCPA compliant
- SOC 2 Type II (in progress)

## Security Contacts

- Security Team: security@haven.app
- DPO: privacy@haven.app
- Emergency: +1-XXX-XXX-XXXX (24/7)

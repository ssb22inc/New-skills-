# Security Policy & Vulnerability Disclosure

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
   - Your contact information

### What to Expect

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Resolution Timeline**: Based on severity
  - **Critical**: 24-48 hours
  - **High**: 1 week
  - **Medium**: 2 weeks
  - **Low**: Next release cycle

### Responsible Disclosure

We ask security researchers to:
- Give us reasonable time to fix vulnerabilities before public disclosure
- Not exploit vulnerabilities beyond what's necessary for proof of concept
- Not access or modify user data
- Not perform denial of service attacks
- Not spam or social engineer our users or staff

We commit to:
- Respond promptly to your report
- Keep you updated on our progress
- Publicly acknowledge your responsible disclosure (if desired)
- Not take legal action against researchers who follow this policy

---

## Bug Bounty Program

We offer rewards for responsibly disclosed vulnerabilities:

### Reward Tiers

| Severity | Reward Range | Examples |
|----------|--------------|----------|
| **Critical** | $1,000 - $5,000 | RCE, Authentication bypass, SQL injection leading to data exposure |
| **High** | $500 - $1,000 | XSS with authentication bypass, CSRF on sensitive actions, Privilege escalation |
| **Medium** | $100 - $500 | XSS, CSRF on non-sensitive actions, Information disclosure |
| **Low** | $50 - $100 | Security misconfigurations, Minor information leaks |

### In Scope

- haven.app and all subdomains
- Mobile applications (iOS/Android)
- API endpoints
- Admin panels
- Authentication and authorization flows
- Data storage and handling
- Third-party integrations

### Out of Scope

- Theoretical vulnerabilities without proof of exploit
- Social engineering attacks
- Physical attacks
- Denial of Service (DoS/DDoS)
- Spam or social engineering of Haven users
- Reports from automated scanners without validation
- Recently disclosed zero-day vulnerabilities in third-party software
- Issues in third-party applications or websites
- Reports affecting outdated browsers or platforms

### Ineligible Vulnerabilities

- Missing security headers that don't lead to a vulnerability
- Self-XSS
- Logout CSRF
- Missing rate limiting (unless it leads to a vulnerability)
- Clickjacking on pages with no sensitive actions
- Mixed content warnings
- SSL/TLS configuration issues on non-Haven infrastructure
- Software version disclosure
- Stack traces without sensitive information
- Directory listings that don't expose sensitive data

---

## Security Measures

### Authentication
- Argon2id password hashing (memory=64MB, iterations=3)
- Rate limiting on authentication endpoints (5 attempts/minute)
- Session management with secure HTTP-only cookies
- Multi-factor authentication support (planned)
- Account lockout after 5 failed attempts

### Data Protection
- AES-256-GCM encryption for sensitive data at rest
- TLS 1.3 for data in transit
- Database encryption at rest (Supabase)
- PII masking in application logs
- Secure key management

### Infrastructure Security
- Web Application Firewall (WAF)
- DDoS mitigation
- Regular security audits
- Automated vulnerability scanning
- Container security scanning
- Dependency vulnerability monitoring

### Application Security
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (DOMPurify sanitization)
- CSRF protection on state-changing operations
- Security-focused ESLint rules
- Regular penetration testing

### Compliance
- **GDPR**: Full compliance with data subject rights
  - Right to access (Article 15)
  - Right to erasure (Article 17)
  - Right to rectification (Article 16)
  - Right to data portability (Article 20)
  - Consent management
- **CCPA**: California Consumer Privacy Act compliance
- **SOC 2 Type II**: In progress (Q2 2026)

### Monitoring & Response
- Real-time security monitoring
- Automated alert system
- Incident response procedures
- 24/7 security team on-call
- Audit logging with 90-day retention
- Security incident runbooks

---

## Data Privacy

### Data Collection
We collect only the data necessary to provide our services:
- Account information (email, name, phone)
- Profile data (user type, preferences)
- Listing information (for landlords)
- Search and match data (for seekers)
- Communication history
- Analytics and usage data

### Data Storage
- All data stored in SOC 2 compliant data centers
- Encryption at rest using AES-256
- Geographic data residency options
- Regular backups with encryption

### Data Retention
- Active account data: Retained while account is active
- Deleted account data: Anonymized after 30 days
- Audit logs: 90 days (critical events retained longer)
- Analytics data: 365 days
- Backups: 90 days

### Data Sharing
We do not sell user data. We share data only:
- With user consent
- To provide services (e.g., payment processing)
- As required by law
- To protect our rights or safety

### User Rights
Users can:
- Access their data (download in JSON format)
- Correct their data
- Delete their account and data
- Opt-out of marketing communications
- Withdraw consent
- Port their data to another service

---

## Security Contacts

- **Security Team**: security@haven.app
- **Data Protection Officer**: privacy@haven.app
- **Emergency Hotline**: +1-555-HAVEN-911 (24/7)
- **General Support**: support@haven.app

---

## Security Certifications & Compliance

### Current
- ✅ GDPR Compliant
- ✅ CCPA Compliant
- ✅ WCAG 2.1 AA Accessibility
- ✅ OWASP Top 10 Protected

### In Progress
- 🔄 SOC 2 Type II (Target: Q2 2026)
- 🔄 ISO 27001 (Target: Q3 2026)
- 🔄 PCI DSS Level 1 (Target: Q4 2026)

---

## Security Updates

We maintain transparency about security:
- Security advisories published at https://haven.app/security
- CVE numbers assigned for significant vulnerabilities
- Public disclosure after 90 days or upon fix deployment
- Security newsletter for subscribers

---

## Legal

This security policy does not give you permission to:
- Access systems or data you're not authorized to access
- Violate any laws or regulations
- Disrupt our services or users
- Access, modify, or destroy data

Researchers who follow this policy will be considered authorized security researchers and will not face legal action from Haven for their research activities.

---

## Version History

- **v1.1** (2026-01-06): Added bug bounty program, compliance certifications
- **v1.0** (2026-01-01): Initial security policy

---

## Acknowledgments

We thank the following security researchers for their responsible disclosures:

_(List will be updated as vulnerabilities are reported and fixed)_

---

For questions about this policy, contact: security@haven.app

Last updated: January 6, 2026

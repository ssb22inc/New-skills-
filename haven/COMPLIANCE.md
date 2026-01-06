# GDPR & Privacy Compliance

This document outlines Haven's compliance with GDPR and other privacy regulations.

## GDPR Compliance

### Data Subject Rights Implementation

#### Right to Access (Article 15)

Users can request a copy of all their personal data.

**API Endpoint**: `GET /api/privacy/data-export`

**Implementation**:
```typescript
import { exportUserData } from '@/lib/privacy/gdpr';

const userData = await exportUserData(userId);
```

**Data Included**:
- Profile information
- Seeker/Landlord specific data
- Listings
- Bookings
- Messages
- Reviews
- Consent records

**Format**: JSON (machine-readable)

**Timeline**: Within 30 days of request

---

#### Right to Erasure (Article 17)

Users can request deletion of their personal data.

**API Endpoint**: `DELETE /api/privacy/data`

**Implementation**:
```typescript
import { deleteUserData } from '@/lib/privacy/gdpr';

await deleteUserData(userId, {
  hardDelete: false, // Soft delete by default
  preserveAuditLogs: true
});
```

**Options**:
- **Soft Delete**: Anonymizes data (default)
- **Hard Delete**: Permanently removes data
- **Preserve Audit Logs**: Keeps anonymized audit trail

**Timeline**: Within 30 days of request

**Exceptions**:
- Legal obligations to retain data
- Pending transactions
- Ongoing disputes

---

#### Right to Rectification (Article 16)

Users can correct inaccurate personal data.

**API Endpoint**: `PATCH /api/privacy/rectify`

**Implementation**:
```typescript
import { rectifyUserData } from '@/lib/privacy/gdpr';

await rectifyUserData(userId, {
  full_name: 'Corrected Name',
  phone: '+1234567890'
});
```

**Timeline**: Immediate

---

#### Right to Data Portability (Article 20)

Users can receive their data in a portable format.

**API Endpoint**: `GET /api/privacy/data-portable`

**Implementation**:
```typescript
import { exportDataPortable } from '@/lib/privacy/gdpr';

const jsonData = await exportDataPortable(userId);
```

**Format**: JSON (structured, machine-readable)

**Timeline**: Within 30 days

---

### Consent Management

#### Consent Types

1. **Necessary**: Required for service operation (cannot be withdrawn)
2. **Marketing**: Email/SMS marketing communications
3. **Analytics**: Usage analytics and product improvement
4. **Third-Party**: Data sharing with third-party services

#### Consent Recording

**Implementation**:
```typescript
import { recordConsent } from '@/lib/privacy/gdpr';

await recordConsent(userId, [
  {
    type: 'marketing',
    granted: true,
    timestamp: new Date().toISOString(),
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0...'
  }
]);
```

#### Consent Requirements

- ✅ Freely given
- ✅ Specific and informed
- ✅ Unambiguous indication
- ✅ Easy to withdraw
- ✅ Granular (per purpose)
- ✅ Documented with timestamp, IP, and user agent

---

### Data Processing

#### Legal Basis for Processing

| Purpose | Legal Basis | Data |
|---------|-------------|------|
| Account creation | Contract | Email, name, password |
| Listing management | Contract | Property details, photos |
| Matching | Legitimate interest | Preferences, search criteria |
| Communications | Contract | Messages, notifications |
| Payment processing | Contract | Payment information |
| Analytics | Consent | Usage data, interactions |
| Marketing | Consent | Contact information |

#### Data Minimization

We collect only data necessary for:
- Service provision
- Legal compliance
- User-requested features

#### Purpose Limitation

Data is used only for:
- The purpose it was collected
- Compatible purposes
- With explicit consent for new purposes

---

### Data Security

#### Technical Measures

- **Encryption at Rest**: AES-256-GCM
- **Encryption in Transit**: TLS 1.3
- **Password Hashing**: Argon2id
- **Access Controls**: Role-based access
- **Audit Logging**: All data access logged

#### Organizational Measures

- Security training for staff
- Access on need-to-know basis
- Regular security audits
- Incident response procedures
- Data Protection Impact Assessments (DPIA)

---

### Data Retention

#### Retention Periods

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Active accounts | Duration of account | Contract |
| Deleted accounts | 30 days (anonymized) | Legal obligation |
| Audit logs | 90 days (critical: longer) | Legal obligation |
| Analytics | 365 days | Legitimate interest |
| Financial records | 7 years | Legal obligation |
| Communication logs | 90 days | Legal obligation |

#### Automated Deletion

**Implementation**:
```typescript
import { enforceRetentionPolicies } from '@/lib/privacy/data-retention';

// Run daily via cron
await enforceRetentionPolicies();
```

---

### Data Transfers

#### International Transfers

- Primary storage: EU/US (user choice)
- Standard Contractual Clauses (SCCs) for transfers
- Adequacy decisions where applicable

#### Third-Party Processors

| Service | Purpose | Location | Safeguards |
|---------|---------|----------|------------|
| Supabase | Database | US/EU | DPA, SCCs |
| Stripe | Payments | US | DPA, Shield |
| OpenAI | AI features | US | DPA |
| Vercel | Hosting | Global CDN | DPA |

All processors have Data Processing Agreements (DPAs).

---

### Breach Notification

#### Timeline

- **Discovery to DPA**: Within 72 hours
- **Discovery to Users**: Without undue delay (if high risk)

#### Notification Content

- Nature of breach
- Data categories affected
- Likely consequences
- Measures taken
- Contact point for information

#### Procedures

1. Detect and contain breach
2. Assess severity and impact
3. Notify DPA (if required)
4. Notify affected users (if required)
5. Document incident
6. Implement preventive measures

---

## CCPA Compliance

### California Consumer Rights

1. **Right to Know**: What data is collected and why
2. **Right to Delete**: Delete personal information
3. **Right to Opt-Out**: Opt-out of sale (we don't sell data)
4. **Right to Non-Discrimination**: Equal service regardless of rights exercised

### "Do Not Sell My Personal Information"

We do not sell personal information to third parties.

**Public Declaration**: Available at /privacy#ccpa

---

## Cookie Policy

### Cookie Types

1. **Strictly Necessary**: Essential for site function
   - Session cookies
   - Authentication tokens
   - CSRF protection

2. **Functional**: Enhance user experience
   - Language preferences
   - UI preferences

3. **Analytics**: Website usage analysis
   - Google Analytics (with consent)
   - Internal analytics

4. **Marketing**: Targeted advertising
   - Not currently used

### Cookie Consent

- Banner shown on first visit
- Granular consent options
- Easy opt-out
- Consent stored for 12 months

---

## Privacy by Design

### Principles

1. **Proactive not Reactive**: Privacy built-in from the start
2. **Privacy as Default**: Maximum privacy by default
3. **Privacy Embedded**: Privacy integral to system
4. **Positive-Sum**: Win-win for all
5. **End-to-End Security**: Lifecycle protection
6. **Visibility and Transparency**: Open and clear
7. **User-Centric**: Respect for user privacy

### Implementation

- Pseudonymization where possible
- Anonymization of analytics
- Data minimization
- Privacy impact assessments
- Regular privacy audits

---

## Data Protection Officer

**Contact**: privacy@haven.app

**Responsibilities**:
- Monitor GDPR compliance
- Conduct DPIAs
- Cooperate with supervisory authorities
- Act as contact point for data subjects
- Provide advice on privacy matters

---

## Supervisory Authority

**Lead Supervisory Authority**: [To be determined based on main establishment]

**Right to Lodge Complaint**: Users can file complaints with their local data protection authority.

---

## Documentation

### Records of Processing Activities

Maintained as required by Article 30 GDPR:
- Purposes of processing
- Categories of data
- Categories of recipients
- International transfers
- Retention periods
- Security measures

### Data Processing Agreements

All third-party processors have signed DPAs covering:
- Subject matter and duration
- Nature and purpose
- Type of personal data
- Obligations and rights
- Security measures

---

## Compliance Checklist

- [x] Privacy Policy published
- [x] Cookie Policy published
- [x] Data subject rights implemented
- [x] Consent management system
- [x] Data retention policies
- [x] Security measures implemented
- [x] Breach notification procedures
- [x] DPA with processors
- [x] Privacy by Design principles
- [x] DPO appointed
- [x] Staff training completed
- [x] DPIA procedures established
- [x] Records of processing maintained

---

## Updates

This compliance document is reviewed quarterly and updated as needed.

**Last Review**: January 6, 2026
**Next Review**: April 6, 2026

---

For compliance questions: privacy@haven.app

# Missing Critical Implementations

This document lists all files and features that need to be created/implemented for production readiness.

---

## 🔴 CRITICAL - Week 1 (Blockers)

### 1. Authentication API Routes

**Location:** `src/app/api/auth/`

```bash
src/app/api/auth/
├── login/route.ts           ❌ POST /api/auth/login
├── signup/route.ts          ❌ POST /api/auth/signup
├── logout/route.ts          ❌ POST /api/auth/logout
├── reset-password/route.ts  ❌ POST /api/auth/reset-password
├── verify-email/route.ts    ❌ POST /api/auth/verify-email
└── refresh/route.ts         ❌ POST /api/auth/refresh
```

**Must Include:**
- Supabase auth integration
- Email verification flow
- Password reset flow
- Session management
- Error handling
- Rate limiting

### 2. Bookings API

**Location:** `src/app/api/bookings/`

```bash
src/app/api/bookings/
├── route.ts                 ❌ GET (list), POST (create)
├── [id]/route.ts           ❌ GET, PATCH, DELETE
├── [id]/confirm/route.ts   ❌ POST
└── [id]/cancel/route.ts    ❌ POST
```

**Must Include:**
- Create booking
- List user bookings
- Cancel booking
- Confirm booking
- Payment integration
- Status transitions

### 3. Messaging API

**Location:** `src/app/api/messages/`

```bash
src/app/api/messages/
├── conversations/
│   ├── route.ts            ❌ GET (list), POST (create)
│   └── [id]/
│       ├── route.ts        ❌ GET (messages)
│       └── read/route.ts   ❌ PATCH (mark as read)
└── route.ts                ❌ POST (send message)
```

**Must Include:**
- Create conversation
- Send message
- List conversations
- Mark as read
- Real-time subscriptions

### 4. Payment System

**Location:** `src/app/api/payments/`

```bash
src/app/api/payments/
├── create-checkout/route.ts       ✅ EXISTS
├── webhook/route.ts                ❌ POST (Stripe webhooks)
├── connect/
│   ├── onboard/route.ts           ❌ POST (landlord onboarding)
│   └── status/route.ts            ❌ GET (onboarding status)
├── subscription/
│   ├── route.ts                   ❌ GET, POST, DELETE
│   └── [id]/route.ts              ❌ PATCH
└── refund/route.ts                ❌ POST
```

**Must Include:**
- Stripe Connect onboarding
- Webhook event handlers
- Payment intent confirmation
- Subscription management
- Refund processing
- Security deposit handling

### 5. File Upload API

**Location:** `src/app/api/upload/`

```bash
src/app/api/upload/
├── images/route.ts          ❌ POST (upload images)
├── documents/route.ts       ❌ POST (upload documents)
└── avatar/route.ts          ❌ POST (upload avatar)
```

**Must Include:**
- Supabase Storage integration
- File type validation
- Image resizing
- Virus scanning
- URL generation
- Delete functionality

### 6. Email Service

**Location:** `src/lib/email/`

```bash
src/lib/email/
├── client.ts                ❌ Email service client
├── templates/
│   ├── welcome.tsx         ❌ React Email template
│   ├── verify-email.tsx    ❌
│   ├── reset-password.tsx  ❌
│   ├── booking-confirmation.tsx ❌
│   ├── message-notification.tsx ❌
│   └── match-notification.tsx   ❌
└── send.ts                  ❌ Send email functions
```

**Integration:** Resend / SendGrid / Mailgun

### 7. Frontend Pages

**Location:** `src/app/`

```bash
src/app/
├── listings/
│   ├── page.tsx            ❌ Browse listings
│   └── [id]/page.tsx       ❌ Listing detail
├── bookings/
│   ├── page.tsx            ❌ Booking management
│   └── [id]/page.tsx       ❌ Booking detail
├── messages/
│   ├── page.tsx            ❌ Inbox
│   └── [id]/page.tsx       ❌ Conversation
├── profile/
│   └── page.tsx            ❌ User profile
├── settings/
│   └── page.tsx            ❌ Account settings
├── verification/
│   └── page.tsx            ❌ Document upload
└── reviews/
    └── page.tsx            ❌ Review management
```

### 8. Core Components

**Location:** `src/components/`

```bash
src/components/
├── messaging/
│   ├── MessageThread.tsx   ❌ Chat interface
│   ├── MessageInput.tsx    ❌ Message composer
│   └── ConversationList.tsx ❌ Inbox list
├── booking/
│   ├── BookingCard.tsx     ❌ Booking display
│   ├── BookingForm.tsx     ❌ Booking creation
│   └── PaymentForm.tsx     ❌ Stripe payment
├── upload/
│   ├── ImageUpload.tsx     ❌ Image uploader
│   ├── FileDropzone.tsx    ❌ Drag and drop
│   └── DocumentUpload.tsx  ❌ Document uploader
├── search/
│   ├── SearchBar.tsx       ❌ Search input
│   ├── SearchFilters.tsx   ❌ Filter panel
│   └── MapView.tsx         ❌ Map display
├── listing/
│   ├── ListingCard.tsx     ⚠️  May exist, verify
│   ├── ListingGallery.tsx  ❌ Photo gallery
│   └── ListingDetail.tsx   ❌ Full listing view
└── review/
    ├── ReviewForm.tsx      ❌ Write review
    └── ReviewList.tsx      ❌ Display reviews
```

---

## 🟠 HIGH PRIORITY - Week 2-3

### 9. Additional API Routes

```bash
src/app/api/
├── reviews/
│   ├── route.ts            ❌ GET, POST
│   └── [id]/route.ts       ❌ PATCH, DELETE
├── verifications/
│   ├── identity/route.ts   ❌ POST
│   ├── income/route.ts     ❌ POST
│   └── status/route.ts     ❌ GET
├── search/
│   ├── route.ts            ❌ GET (semantic search)
│   └── autocomplete/route.ts ❌ GET
├── favorites/
│   ├── route.ts            ❌ GET
│   └── [listingId]/route.ts ❌ POST, DELETE
└── notifications/
    ├── route.ts            ❌ GET
    ├── [id]/read/route.ts  ❌ PATCH
    └── settings/route.ts   ❌ PATCH
```

### 10. Real-time Features

**Location:** `src/lib/realtime/`

```bash
src/lib/realtime/
├── subscriptions.ts        ❌ Supabase Realtime
├── presence.ts             ❌ User presence
└── hooks/
    ├── useMessages.ts      ❌ Real-time messages
    ├── useNotifications.ts ❌ Real-time notifications
    └── usePresence.ts      ❌ Online status
```

### 11. Supabase Storage Configuration

**Location:** `supabase/`

```bash
supabase/
├── storage-policies.sql    ❌ Storage bucket policies
└── functions/
    └── image-resize/       ❌ Edge function for resizing
        └── index.ts
```

**Buckets to create:**
- `listing-photos`
- `avatars`
- `documents`
- `verification-docs`

### 12. Error Tracking Integration

**Location:** `src/lib/monitoring/`

```bash
src/lib/monitoring/
├── sentry.ts               ❌ Sentry config
├── error-boundary.tsx      ❌ React error boundary
└── logger.ts               ❌ Winston/Pino logger
```

---

## 🟡 MEDIUM PRIORITY - Week 4-5

### 13. Background Jobs

**Location:** `src/jobs/`

```bash
src/jobs/
├── queue.ts                ❌ BullMQ/Inngest setup
├── workers/
│   ├── match-calculator.ts ❌ Calculate match scores
│   ├── email-sender.ts     ❌ Send queued emails
│   ├── cleanup.ts          ❌ Cleanup expired data
│   └── analytics.ts        ❌ Aggregate analytics
└── schedules/
    └── cron.ts             ❌ Scheduled tasks
```

### 14. Admin Panel

**Location:** `src/app/admin/`

```bash
src/app/admin/
├── layout.tsx              ❌ Admin layout
├── page.tsx                ❌ Admin dashboard
├── users/
│   └── page.tsx            ❌ User management
├── listings/
│   └── page.tsx            ❌ Listing moderation
├── verifications/
│   └── page.tsx            ❌ Verification queue
└── analytics/
    └── page.tsx            ❌ Analytics dashboard
```

### 15. Analytics Integration

**Location:** `src/lib/analytics/`

```bash
src/lib/analytics/
├── google-analytics.ts     ❌ GA4 integration
├── mixpanel.ts             ❌ Mixpanel (optional)
├── events.ts               ❌ Event definitions
└── hooks/
    └── useTracking.ts      ❌ Track events
```

### 16. Legal Pages

**Location:** `src/app/legal/`

```bash
src/app/legal/
├── terms/page.tsx          ❌ Terms of Service
├── privacy/page.tsx        ❌ Privacy Policy
├── cookies/page.tsx        ❌ Cookie Policy
└── components/
    └── CookieBanner.tsx    ❌ Cookie consent
```

### 17. API Route Tests

**Location:** `tests/api/`

```bash
tests/api/
├── auth.test.ts            ❌ Auth endpoints
├── listings.test.ts        ❌ Listings endpoints
├── bookings.test.ts        ❌ Bookings endpoints
├── messages.test.ts        ❌ Messages endpoints
├── payments.test.ts        ❌ Payments endpoints
└── __helpers__/
    └── test-utils.ts       ❌ API test utilities
```

---

## 🟢 NICE TO HAVE - Post-Launch

### 18. Advanced Search

**Location:** `src/lib/search/`

```bash
src/lib/search/
├── algolia.ts              ❌ Algolia integration
├── filters.ts              ❌ Advanced filters
└── saved-searches.ts       ❌ Saved search management
```

### 19. Map Integration

**Location:** `src/lib/maps/`

```bash
src/lib/maps/
├── google-maps.ts          ❌ Google Maps
├── geocoding.ts            ❌ Address → coordinates
└── components/
    ├── MapView.tsx         ❌ Map display
    └── MarkerCluster.tsx   ❌ Cluster markers
```

### 20. Mobile App (Future)

```bash
mobile/
├── app/                    ❌ Expo/React Native app
├── ios/                    ❌ iOS native
└── android/                ❌ Android native
```

---

## Configuration Files Needed

### Environment Variables (Missing)

**Create:** `.env.production`

```env
# Email Service
EMAIL_FROM=noreply@haven.app
EMAIL_REPLY_TO=support@haven.app
RESEND_API_KEY=

# Error Tracking
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=
MIXPANEL_TOKEN=

# Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=

# Jobs
REDIS_URL=

# Identity Verification
PERSONA_API_KEY=
CHECKR_API_KEY=
```

### Database Migrations (Additional)

**Create:** `supabase/migrations/`

```sql
002_storage_buckets.sql      ❌ Storage bucket setup
003_realtime_setup.sql       ❌ Realtime subscriptions
004_admin_roles.sql          ❌ Admin user roles
005_indexes_optimization.sql ❌ Additional indexes
```

---

## Summary of Missing Items

### By Priority:

**CRITICAL (Week 1):**
- 6 auth routes
- 6 booking routes
- 5 messaging routes
- 6 payment routes
- 3 upload routes
- 1 email service
- 8 frontend pages
- 12 core components

**Total Critical Items: ~47 files**

**HIGH PRIORITY (Week 2-3):**
- 15 additional API routes
- 3 real-time features
- Storage configuration
- Error tracking
- Monitoring

**Total High Priority Items: ~22 files**

**MEDIUM PRIORITY (Week 4-5):**
- Background jobs system
- Admin panel (5 pages)
- Analytics integration
- Legal pages (3)
- API tests

**Total Medium Priority Items: ~18 files**

**TOTAL MISSING ITEMS: ~87 files/features**

---

## Recommended Implementation Order

### Week 1:
1. ✅ Email service setup (unblocks notifications)
2. ✅ Authentication API routes
3. ✅ File upload system
4. ✅ Payment webhooks

### Week 2:
5. ✅ Bookings API
6. ✅ Messaging API
7. ✅ Frontend pages (listings, bookings)
8. ✅ Core components

### Week 3:
9. ✅ Real-time features
10. ✅ Reviews API
11. ✅ Search implementation
12. ✅ Error tracking

### Week 4:
13. ✅ Admin panel
14. ✅ Background jobs
15. ✅ Analytics
16. ✅ Legal pages

### Week 5:
17. ✅ Comprehensive testing
18. ✅ Performance optimization
19. ✅ Security audit
20. ✅ Production deployment

---

## Quick Start Template

To rapidly create missing files, use these templates:

### API Route Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  // Define schema
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Implementation

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Component Template

```typescript
'use client';

import { useState } from 'react';

interface Props {
  // Define props
}

export function ComponentName({ }: Props) {
  const [state, setState] = useState();

  return (
    <div>
      {/* Implementation */}
    </div>
  );
}
```

---

**Last Updated:** February 19, 2026
**Status:** Production Blockers Identified
**Next Steps:** Begin Week 1 critical implementations

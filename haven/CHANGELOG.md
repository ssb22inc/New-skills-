# Changelog

All notable changes to Haven will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Haven uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Production Helm values (`values-staging.yaml`, `values-production.yaml`)
- Grafana provisioning for auto-loading dashboards and datasources
- Security tables migration (`002_security_tables.sql`): `security_alerts`, `blocked_ips`, `consent_records`, `data_deletion_requests`
- Custom error pages: `not-found.tsx`, `error.tsx`, `global-error.tsx`
- Metrics endpoint bearer token authentication
- `prom-client`, `@upstash/ratelimit`, `@upstash/redis` dependencies
- Terraform: ALB, ACM certificate, security groups, `variables.tf`, `outputs.tf`
- `scripts/backup.sh` — encrypted database backups to S3
- `docs/disaster-recovery.md` — RTO/RPO targets and recovery procedures
- `k8s/alertmanager.yaml` — Alertmanager deployment with PagerDuty + Slack integration
- CI migration step — runs `supabase db push` before each deploy
- Security headers + rate limiting applied in `middleware.ts`
- Operational runbooks: high error rate, high latency, database connections
- `README.md` with full local setup guide
- `.nvmrc` pinning Node.js 20
- `supabase/seed.sql` and `scripts/seed.sh` for development data
- OpenAPI specification at `docs/openapi.yaml`

---

## [0.13.0] — 2024-03-01

### Added
- Monitoring & Observability stack: Prometheus, Grafana dashboards, Loki, Promtail, Alertmanager rules
- Custom business metrics: match scores, funnel steps, AI request duration
- Load testing with k6 and Artillery

## [0.12.0] — 2024-02-23

### Added
- CI/CD pipelines: GitHub Actions for lint, test, build, deploy (staging + production)
- Docker multi-stage build with non-root user
- GitLab CI/CD as alternative pipeline

## [0.11.0] — 2024-02-16

### Added
- Kubernetes manifests: Deployment, Service, Ingress, ConfigMap, NetworkPolicy, HPA, PDB
- Helm chart for parameterised deployments
- Terraform for AWS EKS, RDS, ElastiCache, S3, CloudFront, ECR

## [0.10.0] — 2024-02-09

### Added
- Security hardening: CSRF protection, input sanitisation, security headers
- Rate limiting with Upstash Redis
- Audit logging to `public.audit_logs`
- GDPR compliance: consent records, data retention, right to erasure
- Incident response manager
- Security monitoring: brute force detection, anomaly detection

## [0.9.0] — 2024-02-02

### Added
- Performance optimisation: ISR, edge caching, image optimisation, code splitting
- Nginx configuration for production serving
- Bundle analysis and Core Web Vitals monitoring

## [0.8.0] — 2024-01-26

### Added
- Comprehensive testing: Vitest unit tests, Playwright E2E, integration tests
- Security penetration tests (CSRF, injection, header validation)
- Load testing scaffolding

## [0.7.0] — 2024-01-19

### Added
- Stripe payment integration: checkout sessions, webhooks, subscription management

## [0.6.0] — 2024-01-12

### Added
- Real-time messaging with Supabase Realtime
- Conversation and message management
- Notification system

## [0.5.0] — 2024-01-05

### Added
- AI matching engine: lifestyle, personality, location, budget, amenity, and trust scoring
- ML refinement with outcome feedback loop
- Swipe-style match interface

## [0.4.0] — 2023-12-29

### Added
- Listing management: create, edit, publish, archive
- AI listing generator from voice and text
- Photo analysis and upload

## [0.3.0] — 2023-12-22

### Added
- Onboarding flows for seekers and landlords
- AI-driven quiz/chat onboarding
- Profile embedding for vector similarity matching

## [0.2.0] — 2023-12-15

### Added
- Supabase authentication (email + OAuth)
- Database schema: profiles, listings, matches, bookings, messaging, reviews

## [0.1.0] — 2023-12-08

### Added
- Initial Next.js 16 project setup with Tailwind CSS, Supabase, TypeScript

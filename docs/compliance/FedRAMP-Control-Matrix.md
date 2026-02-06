# Procura — FedRAMP Moderate Control Implementation Matrix

**System:** Procura Ops
**Impact Level:** Moderate
**Date:** February 2026

This matrix maps NIST SP 800-53 Rev 5 control families to Procura's implementation status.

---

## Control Family Summary

| Family | Controls | Implemented | Inherited | Planned | N/A |
|--------|----------|-------------|-----------|---------|-----|
| AC — Access Control | 25 | 18 | 3 | 4 | 0 |
| AU — Audit & Accountability | 16 | 10 | 2 | 4 | 0 |
| AT — Awareness & Training | 5 | 0 | 0 | 5 | 0 |
| CM — Configuration Management | 11 | 8 | 1 | 2 | 0 |
| CP — Contingency Planning | 13 | 2 | 6 | 5 | 0 |
| IA — Identification & Authentication | 12 | 9 | 1 | 2 | 0 |
| IR — Incident Response | 10 | 4 | 0 | 6 | 0 |
| MA — Maintenance | 6 | 0 | 6 | 0 | 0 |
| MP — Media Protection | 8 | 3 | 3 | 2 | 0 |
| PE — Physical & Environmental | 20 | 0 | 20 | 0 | 0 |
| PL — Planning | 9 | 2 | 0 | 7 | 0 |
| PM — Program Management | 16 | 0 | 0 | 16 | 0 |
| PS — Personnel Security | 8 | 0 | 0 | 8 | 0 |
| RA — Risk Assessment | 5 | 1 | 0 | 4 | 0 |
| SA — System & Services Acquisition | 22 | 5 | 2 | 15 | 0 |
| SC — System & Comms Protection | 44 | 12 | 8 | 24 | 0 |
| SI — System & Info Integrity | 16 | 11 | 1 | 4 | 0 |
| SR — Supply Chain Risk Management | 12 | 0 | 0 | 12 | 0 |

---

## Detailed Control Mapping

### AC — Access Control

| Control | Title | Status | Implementation |
|---------|-------|--------|---------------|
| AC-1 | Policy & Procedures | Planned | Document access control policy |
| AC-2 | Account Management | **Implemented** | Supabase Auth + admin user management API + cascading deletion |
| AC-2(1) | Automated System Account Management | **Implemented** | Admin dashboard user CRUD via `/api/admin/users` |
| AC-2(4) | Automated Audit Actions | Planned | POA-011: Auto-disable inactive accounts |
| AC-3 | Access Enforcement | **Implemented** | RLS, JWT auth, dependency injection (`get_current_user`, `require_admin`, `require_officer`) |
| AC-4 | Information Flow Enforcement | **Implemented** | CORS policy, nginx proxy, ownership-scoped queries |
| AC-5 | Separation of Duties | **Implemented** | Three-tier RBAC, sequential approval workflow (legal → finance) |
| AC-6 | Least Privilege | **Implemented** | Role-based endpoint access, non-admin users see only own resources |
| AC-7 | Unsuccessful Login Attempts | **Implemented** | Supabase Auth rate limiting + slowapi application rate limiter |
| AC-8 | System Use Notification | **Implemented** | Landing page with system identification |
| AC-11 | Session Lock | **Implemented** | JWT expiration, auto-refresh with PKCE flow |
| AC-12 | Session Termination | **Implemented** | Logout clears session, token, and state |
| AC-14 | Permitted Actions w/o Auth | **Implemented** | Only `/`, `/health`, and landing page accessible without auth |
| AC-17 | Remote Access | **Implemented** | HTTPS + CORS + API proxy |
| AC-17(1) | Monitoring/Control | Partial | Request logging middleware; needs SIEM (POA-002) |
| AC-22 | Publicly Accessible Content | **Implemented** | No sensitive data in unauthenticated responses |

### AU — Audit & Accountability

| Control | Title | Status | Implementation |
|---------|-------|--------|---------------|
| AU-2 | Event Logging | **Implemented** | Request logging middleware on all API calls |
| AU-3 | Content of Audit Records | **Implemented** | Timestamp, user, action, resource, IP, duration, changes |
| AU-3(1) | Additional Audit Info | **Implemented** | structlog structured JSON with correlation fields |
| AU-4 | Audit Log Storage Capacity | Inherited | Supabase PostgreSQL storage |
| AU-5 | Response to Audit Failures | Planned | Add alerting on audit write failures |
| AU-6 | Audit Record Review | **Implemented** | Admin Audit Vault UI with search/filter |
| AU-8 | Time Stamps | **Implemented** | UTC timestamps via `datetime.now(timezone.utc)` |
| AU-9 | Protection of Audit Information | **Implemented** | HMAC-SHA256 signing, admin-only RLS |
| AU-11 | Audit Record Retention | **Implemented** | PostgreSQL retention (configurable) |
| AU-12 | Audit Record Generation | **Implemented** | Automatic on all API requests + CRUD operations |

### IA — Identification & Authentication

| Control | Title | Status | Implementation |
|---------|-------|--------|---------------|
| IA-1 | Policy & Procedures | Planned | Document authentication policy |
| IA-2 | User Identification & Auth | **Implemented** | Supabase Auth email/password with JWT |
| IA-2(1) | Multi-Factor Auth (Network) | **Implemented** | TOTP MFA via Supabase Auth MFA API |
| IA-2(2) | Multi-Factor Auth (Local) | **Implemented** | Same TOTP implementation |
| IA-4 | Identifier Management | **Implemented** | UUID-based user IDs via Supabase |
| IA-5 | Authenticator Management | **Implemented** | Password via Supabase Auth, API keys via Fernet vault |
| IA-5(1) | Password-Based Auth | **Implemented** | Supabase Auth handles hashing (bcrypt) |
| IA-6 | Authenticator Feedback | **Implemented** | Password field masking, toggle visibility |
| IA-8 | Identification of Non-Org Users | **Implemented** | Connector API keys encrypted in vault |
| IA-11 | Re-authentication | Partial | JWT refresh; no explicit re-auth for sensitive ops |

### SC — System & Communications Protection

| Control | Title | Status | Implementation |
|---------|-------|--------|---------------|
| SC-1 | Policy & Procedures | Planned | Document SC policy |
| SC-7 | Boundary Protection | Partial | CORS + nginx proxy; WAF planned (POA-012) |
| SC-8 | Transmission Confidentiality | Planned | TLS configured at infrastructure level (POA-001) |
| SC-8(1) | Cryptographic Protection (Transit) | Planned | TLS 1.2+ at load balancer |
| SC-12 | Cryptographic Key Management | **Implemented** | Fernet key generation, HMAC signing key, documented in .env.example |
| SC-13 | Cryptographic Protection | **Implemented** | Fernet (AES-128-CBC + HMAC), HMAC-SHA256, JWT |
| SC-23 | Session Authenticity | **Implemented** | PKCE auth flow, `storageKey: 'procura-auth-token'` |
| SC-28 | Protection at Rest | **Implemented** | Supabase RDS encryption + Fernet vault + S3 SSE |

### SI — System & Information Integrity

| Control | Title | Status | Implementation |
|---------|-------|--------|---------------|
| SI-2 | Flaw Remediation | **Implemented** | 82 unit tests + Playwright E2E + CI/CD pipeline |
| SI-3 | Malicious Code Protection | **Implemented** | Upload scanning (MIME, signatures, size), path traversal protection |
| SI-4 | System Monitoring | **Implemented** | Request logging, error tracking, rate limiting |
| SI-5 | Security Alerts | **Implemented** | In-app notifications for critical events |
| SI-10 | Information Input Validation | **Implemented** | Pydantic models, PostgREST injection sanitization, query parameter validation |
| SI-11 | Error Handling | **Implemented** | Generic error messages in production, structured logging for debugging |
| SI-12 | Information Handling | **Implemented** | Ownership-scoped data access, encrypted credentials |
| SI-16 | Memory Protection | Inherited | Python/Node.js managed memory; container isolation |

---

## Legend

- **Implemented**: Control is fully operational in current codebase
- **Inherited**: Control provided by underlying cloud infrastructure (Supabase, AWS/GCP)
- **Planned**: Control identified in POA&M with target date
- **Partial**: Partially implemented, enhancement planned
- **N/A**: Not applicable to this system

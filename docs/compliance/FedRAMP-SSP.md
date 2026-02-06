# Procura — FedRAMP System Security Plan (SSP)

**System Name:** Procura Ops — Government Contract Capture & Proposal Automation Platform
**FIPS 199 Impact Level:** Moderate
**FedRAMP Authorization Target:** FedRAMP Moderate (Tailored for SaaS)
**Document Version:** 1.0
**Date:** February 2026
**Prepared by:** Emporium Trading / Procura Engineering

---

## 1. System Description

### 1.1 Purpose

Procura is a cloud-based platform that automates the discovery, qualification, and submission of federal government contract opportunities. It integrates with federal data sources (SAM.gov, GovCon, USAspending), applies AI-driven qualification scoring, and provides a structured submission workflow with sequential approvals, document management, and post-submission follow-up tracking.

### 1.2 System Boundary

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Frontend SPA | React 19, TypeScript, Vite | Cloud PaaS (containerized via nginx) |
| Backend API | Python FastAPI, Celery workers | Cloud PaaS (containerized) |
| Database | Supabase PostgreSQL with Row-Level Security (RLS) | Supabase Cloud (SOC2 Type II) |
| Task Queue | Redis 7 | Cloud-managed or containerized |
| AI Processing | Anthropic Claude API (primary), OpenAI/Google (fallback) | External SaaS (API calls only) |
| Browser Automation | OpenManus / browser-use | Isolated container |
| File Storage | Supabase Storage (S3-compatible) | Supabase Cloud |

### 1.3 Data Flow

```
Federal Sources (SAM.gov, GovCon, USAspending)
        │
        ▼
  [Celery Workers] ──── Discovery & Scraping
        │
        ▼
  [PostgreSQL + RLS] ──── Opportunity Store
        │
        ▼
  [FastAPI Backend] ──── AI Qualification ──── [LLM Provider API]
        │
        ▼
  [React Frontend] ◄──── JWT Auth ──── [Supabase Auth + MFA]
        │
        ▼
  [Submission Engine] ──── Browser Automation ──── [Federal Portals]
        │
        ▼
  [Audit Log Store] ──── HMAC-SHA256 Signed ──── Tamper-evident
```

### 1.4 Users & Roles

| Role | Permissions | Access Level |
|------|-------------|-------------|
| Admin | Full system access, user management, connector config, audit logs | Unrestricted |
| Contract Officer | Create/manage submissions, approve workflows, upload documents | Read/write on own resources |
| Viewer | Read-only access to opportunities and dashboards | Read-only |

---

## 2. Security Control Implementation

### 2.1 Access Control (AC)

| Control | Implementation |
|---------|---------------|
| **AC-2 Account Management** | Supabase Auth handles account lifecycle. Admin endpoint `/api/admin/users` for provisioning/deprovisioning. User deletion cascades to auth records (H12 fix). |
| **AC-3 Access Enforcement** | Row-Level Security (RLS) policies at database layer. Backend `get_current_user` / `require_admin` / `require_officer` dependency injection on every endpoint. Frontend `ProtectedRoute` with `allowedRoles` prop. |
| **AC-6 Least Privilege** | Three-tier RBAC (admin, contract_officer, viewer). Non-admin users can only access their own resources via ownership checks (IDOR fixes H1-H6). |
| **AC-7 Unsuccessful Login Attempts** | Supabase Auth built-in rate limiting on login attempts. Application-level rate limiter (slowapi, 100 req/min per IP). |
| **AC-8 System Use Notification** | Landing page displays system purpose. Terms of use configurable. |
| **AC-11 Session Lock** | JWT tokens with configurable expiration. `autoRefreshToken: true` with `persistSession: true` in Supabase client. |
| **AC-17 Remote Access** | HTTPS-only in production. CORS restricted to configured origins. API proxy via nginx eliminates direct backend exposure. |

### 2.2 Audit & Accountability (AU)

| Control | Implementation |
|---------|---------------|
| **AU-2 Auditable Events** | All API requests logged via `log_requests` middleware (method, path, status, duration). CRUD operations on sensitive resources create audit log entries. |
| **AU-3 Content of Audit Records** | Audit logs contain: timestamp, user ID, action, resource type, resource ID, IP address, changes. Stored in `audit_logs` table. |
| **AU-6 Audit Review** | Audit Vault UI (`/audit`) provides searchable, filterable log viewer. Admin-only access (C5 fix). |
| **AU-9 Protection of Audit Information** | Audit log entries signed with HMAC-SHA256 (`AUDIT_SIGNING_KEY`). Signature verification prevents tampering. RLS prevents non-admin access. |
| **AU-11 Audit Record Retention** | Configurable. Default: indefinite in PostgreSQL. Recommend 3+ years for federal compliance. |

### 2.3 Configuration Management (CM)

| Control | Implementation |
|---------|---------------|
| **CM-2 Baseline Configuration** | `docker-compose.yml` defines reproducible infrastructure. `.env.example` documents all configuration. |
| **CM-3 Configuration Change Control** | GitHub-based change management. `ci.yml` enforces automated tests on all PRs. Branch protection on `main`. |
| **CM-6 Configuration Settings** | Pydantic `Settings` class enforces typed configuration. Production mode disables debug endpoints (`/docs`, `/redoc`). Environment-based feature toggles. |
| **CM-7 Least Functionality** | Production containers run as non-root (`appuser`). Docs/redoc disabled. Debug mode off. Only necessary ports exposed. |

### 2.4 Identification & Authentication (IA)

| Control | Implementation |
|---------|---------------|
| **IA-2 Identification & Authentication** | Supabase Auth with email/password. JWT tokens with cryptographic verification. |
| **IA-2(1) Multi-Factor Authentication** | TOTP-based MFA via Supabase Auth MFA. Enrollment/verification/unenrollment fully implemented. MFA check enforced before dashboard access. |
| **IA-5 Authenticator Management** | Password policies enforced by Supabase (minimum length, complexity). MFA secrets generated server-side. Credential rotation endpoint for connectors. |
| **IA-8 Identification of Non-Organizational Users** | API keys for external service integration (connectors) stored encrypted (Fernet) in vault. |

### 2.5 Incident Response (IR)

| Control | Implementation |
|---------|---------------|
| **IR-4 Incident Handling** | Structured logging (structlog) with correlation. Global exception handler catches unhandled errors. Health check endpoint for monitoring integration. |
| **IR-5 Incident Monitoring** | `/health` endpoint checks database and Redis connectivity. Request logging with timing. Error rate detectable via log aggregation. |
| **IR-6 Incident Reporting** | Audit log provides forensic trail. Notification system for critical events (award notices, deadline changes). |

### 2.6 System & Communications Protection (SC)

| Control | Implementation |
|---------|---------------|
| **SC-8 Transmission Confidentiality** | HTTPS enforced in production (nginx TLS termination or cloud load balancer). Supabase connections use TLS. |
| **SC-12 Cryptographic Key Establishment** | Fernet encryption (AES-128-CBC + HMAC) for credential vault. Keys generated via `cryptography.fernet.Fernet.generate_key()`. Separate HMAC key for audit signing. |
| **SC-13 Cryptographic Protection** | Connector credentials encrypted at rest (Fernet). Audit logs integrity-protected (HMAC-SHA256). JWT tokens cryptographically signed. |
| **SC-28 Protection of Information at Rest** | Database encryption at rest via Supabase (AWS RDS encryption). File uploads stored in Supabase Storage (S3 server-side encryption). Connector credentials encrypted application-level before storage. |

### 2.7 System & Information Integrity (SI)

| Control | Implementation |
|---------|---------------|
| **SI-2 Flaw Remediation** | CI/CD pipeline runs 82+ automated tests on every push. Playwright E2E tests validate critical flows. Dependency versions pinned in `requirements.txt` and `package.json`. |
| **SI-3 Malicious Code Protection** | File upload scanning: MIME type allowlist, executable signature detection (PE, ELF, shell, PHP headers), 50MB size limit, streaming upload validation. Path traversal protection on filenames. |
| **SI-4 Information System Monitoring** | Request logging middleware on all API calls. Structured JSON logging for SIEM integration. Rate limiting (slowapi) detects abuse patterns. |
| **SI-5 Security Alerts** | In-app notification system for critical events. Configurable alert types (award, deadline, amendment). |
| **SI-10 Information Input Validation** | Pydantic model validation on all API inputs. PostgREST filter injection sanitization (C3). Search input sanitization across all routers. Query parameter validation with FastAPI `Query()` constraints. |

### 2.8 Personnel Security (PS) & Physical Protection (PE)

| Control | Notes |
|---------|-------|
| **PS-1 through PS-8** | Organizational policy. Not enforced at application level. Recommend: background checks for admin users, security awareness training. |
| **PE-1 through PE-20** | Cloud infrastructure. Inherited from Supabase (SOC2 Type II) and cloud provider (AWS/GCP). |

---

## 3. Architecture Security Controls Summary

```
┌─────────────────────────────────────────────────────────┐
│                    INTERNET                             │
│                       │                                 │
│              ┌────────▼────────┐                        │
│              │   TLS / HTTPS   │  SC-8                  │
│              └────────┬────────┘                        │
│                       │                                 │
│              ┌────────▼────────┐                        │
│              │     NGINX       │  CM-7, SC-8            │
│              │  (reverse proxy)│  Security headers       │
│              │  Rate limiting  │  AC-7                   │
│              └───┬─────────┬───┘                        │
│                  │         │                             │
│         ┌────────▼──┐  ┌───▼────────┐                  │
│         │ Frontend  │  │  Backend   │                  │
│         │ (static)  │  │  FastAPI   │                  │
│         │           │  │            │                  │
│         │ AC-3 RBAC │  │ AC-2,3,6  │                  │
│         │ IA-2 Auth │  │ AU-2,3    │                  │
│         │           │  │ SI-10     │                  │
│         └───────────┘  │ SI-3      │                  │
│                        └─────┬─────┘                  │
│                              │                         │
│                   ┌──────────┼──────────┐              │
│                   │          │          │               │
│            ┌──────▼───┐ ┌───▼────┐ ┌───▼─────┐       │
│            │Supabase  │ │ Redis  │ │ Vault   │       │
│            │PostgreSQL│ │        │ │(Fernet) │       │
│            │          │ │        │ │         │       │
│            │ AC-3 RLS │ │        │ │ SC-12   │       │
│            │ SC-28    │ │        │ │ SC-13   │       │
│            │ AU-9     │ │        │ │ IA-8    │       │
│            └──────────┘ └────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Continuous Monitoring Strategy

| Activity | Frequency | Tool |
|----------|-----------|------|
| Automated unit + integration tests | Every PR / push | GitHub Actions CI |
| E2E browser tests | Every PR / push | Playwright (CI) |
| Docker image build validation | Every merge to main | GitHub Actions |
| Dependency vulnerability scan | Weekly | Dependabot / Snyk |
| Audit log review | Weekly | Admin Audit Vault UI |
| Credential rotation | Quarterly | Admin connector management |
| Penetration testing | Annually | Third-party assessment |
| FedRAMP annual assessment | Annually | 3PAO |

---

## 5. Data Classification

| Data Type | Classification | Protection |
|-----------|---------------|------------|
| Federal opportunity data | CUI (Controlled Unclassified) | RLS, encrypted at rest, HTTPS in transit |
| User credentials | High sensitivity | Supabase Auth (bcrypt), never stored in app DB |
| Connector API keys | High sensitivity | Fernet encrypted vault, admin-only access |
| Proposal documents | CUI | Supabase Storage (S3 SSE), upload scanning, ownership checks |
| Audit logs | Integrity-critical | HMAC-SHA256 signed, admin-only read access |
| AI analysis results | Business sensitive | Database RLS, ownership-scoped |
| Session tokens | High sensitivity | JWT with expiration, PKCE auth flow, secure storage |

---

## 6. Inherited Controls

The following controls are inherited from the underlying cloud service providers:

### From Supabase (SOC2 Type II certified):
- PE-1 through PE-20 (Physical & Environmental Protection)
- SC-28 (Database encryption at rest — AWS RDS)
- CP-6, CP-7 (Backup & Recovery)
- MA-1 through MA-6 (System Maintenance)

### From Cloud Provider (AWS/GCP):
- PE-1 through PE-20 (Data center physical security)
- SC-7 (Boundary protection — VPC, security groups)
- CP-2 (Contingency plan — multi-AZ availability)
- AC-17 (Network access control)

### From AI Providers (Anthropic, OpenAI):
- Data processing agreements required
- No training on customer data (per provider policies)
- API-only integration (no data persistence on provider side)

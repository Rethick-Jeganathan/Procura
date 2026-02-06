<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Procura Ops Command

**Government Contract Capture & Proposal Automation Platform**

Automate the discovery, qualification, and submission of federal government contract opportunities using AI-powered workflows, browser automation, and end-to-end security.

---

## What It Does

Procura discovers contract opportunities from federal sources (SAM.gov, GovCon, USAspending), qualifies them with AI scoring, manages the full proposal submission lifecycle with sequential approvals, automates portal submissions via browser automation, and provides post-submission follow-up tracking with a tamper-evident audit trail.

---

## PRD Completion Status

### Phase 1: Core Infrastructure — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| PostgreSQL database schema | Done | 6 migration files in `supabase/migrations/` (profiles, opportunities, submissions, connectors, audit_logs, etc.) |
| Row-Level Security (RLS) | Done | `02_rls_policies.sql` + `06_indexes_fk_rls_fixes.sql` — policies on all tables |
| FastAPI application setup | Done | `backend/main.py` — CORS, exception handlers, request logging, rate limiting |
| JWT authentication middleware | Done | `backend/dependencies.py` — `get_current_user`, `require_admin`, `require_officer` |
| RBAC (admin, contract_officer, viewer) | Done | Backend dependency injection + frontend `ProtectedRoute` with `allowedRoles` |
| Pydantic models/schemas | Done | `backend/models.py` — 358 lines, all enums and response types |
| Environment configuration | Done | `backend/config.py` — Pydantic `Settings` with typed env vars |
| Health check endpoints | Done | `GET /` and `GET /health` with DB + Redis connectivity checks |

### Phase 2: Discovery & Vault — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| GovCon API connector | Done | `backend/scrapers/govcon_api.py` |
| SAM.gov API connector | Done | `backend/scrapers/sam_gov.py` |
| USAspending API connector | Done | `backend/scrapers/usaspending.py` |
| Base connector framework | Done | `backend/scrapers/base.py` — abstract class with retry, normalization |
| Intelligent deduplication | Done | `external_ref` unique constraint + merge logic in discovery |
| Celery task queue | Done | `backend/tasks/celery_app.py` + `discovery.py` + `follow_ups.py` |
| Scheduled 15-min discovery | Done | Celery Beat schedule configurable via admin |
| Fernet credential encryption | Done | `backend/security/vault.py` — AES-128-CBC + HMAC |
| Credential rotation | Done | `POST /api/connectors/{id}/rotate` |
| Admin-only vault access | Done | All connector endpoints behind `require_admin` |

### Phase 3: AI Qualification — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Multi-provider LLM client | Done | `backend/ai/llm_client.py` — Anthropic Claude primary, OpenAI and Google fallback |
| Fit Score (0-100) | Done | `backend/ai/qualification.py` — capability match scoring |
| Effort Score (0-100) | Done | Complexity and resource estimation |
| Urgency Score (0-100) | Done | Time-sensitivity based on deadline proximity |
| AI Summary generation | Done | Natural language opportunity analysis |
| Response caching | Done | `llm_cache` table with `prompt_hash` deduplication |
| Configurable model/temperature | Done | `LLM_MODEL`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE` in settings |

### Phase 4: Submission Automation — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Submission workspace | Done | `pages/SubmissionWorkspace.tsx` — task checklist, document management |
| Task/checklist tracking | Done | `submission_tasks` table with completion, locking |
| File upload with scanning | Done | MIME allowlist, executable signature detection, path traversal protection, 50MB limit |
| Sequential approval chain | Done | Legal -> Finance -> Executive, `approval_workflows` table |
| Autonomy mode (auto-approve) | Done | Configurable value threshold via admin settings |
| OpenManus browser automation | Done | `backend/automation/openmanus_client.py` — form fill, file upload, screenshot capture |
| Receipt/confirmation capture | Done | `submission_runs` table with `receipt_id` and screenshots |
| Approve/reject endpoints | Done | `POST /api/submissions/{id}/approve` and `/reject` with ownership checks |

### Phase 5: Frontend Integration — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| React 19 + TypeScript SPA | Done | Vite build, TailwindCSS, React Router 7 |
| Supabase Auth with MFA | Done | `lib/AuthContext.tsx` — TOTP enrollment, verification, unenrollment |
| Dashboard with opportunity pipeline | Done | `pages/Dashboard.tsx` — metrics, search, filters, column customization, expandable rows |
| Submissions queue | Done | `pages/SubmissionsQueue.tsx` — status filtering, list view |
| Submission workspace | Done | `pages/SubmissionWorkspace.tsx` — checklist, documents, approval buttons |
| Admin dashboard | Done | `pages/AdminDashboard.tsx` — users, discovery, AI config, metrics, feature flags |
| Audit vault viewer | Done | `pages/AuditVault.tsx` — searchable log viewer, integrity verification, export |
| Settings page | Done | `pages/Settings.tsx` — API key management, MFA, preferences |
| Landing page with auth | Done | `pages/LandingPage.tsx` — login, signup, forgot password, MFA |
| API client with retry logic | Done | `lib/api.ts` — `ProcuraAPI` class, token refresh, timeout, retries |
| Sidebar navigation | Done | `components/Sidebar.tsx` — dynamic user info, role display, logout |
| Error handling | Done | `components/ErrorBoundary.tsx` with reset + reload |

### Phase 6: Testing & Hardening — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Backend unit tests | Done | 61 pytest tests (`backend/tests/`) — health, models, opportunities, security |
| Frontend unit tests | Done | 21 vitest tests (`tests/`) — API client, components |
| E2E browser tests | Done | 12 Playwright spec files, ~50 test cases (`e2e/`) |
| Security audit | Done | 113 MCR findings fixed (7 critical, 15 high, 7 medium, 3 low) |
| Input validation hardening | Done | PostgREST injection sanitization, Pydantic, Query constraints |
| IDOR protection | Done | Ownership checks on all resource endpoints |
| Rate limiting | Done | slowapi middleware, Redis-backed in production |

### Phase 7: Deployment — COMPLETE

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| Docker containerization | Done | `Dockerfile` (frontend), `backend/Dockerfile` (API), non-root user |
| Docker Compose full stack | Done | `docker-compose.yml` — frontend, backend, celery worker, celery beat, redis |
| Nginx reverse proxy | Done | `nginx.conf` — API proxy, security headers, gzip, caching |
| CI/CD pipeline | Done | `.github/workflows/ci.yml` — tests, build, E2E, Docker validation |
| Environment configuration | Done | `.env.example` files with all variables documented |

---

## Beyond PRD: Additional Features Built

| Feature | Files | Description |
|---------|-------|-------------|
| **Document Library** | `pages/DocumentLibrary.tsx`, `backend/routers/documents.py` | Upload, version, search, and categorize proposal documents with ownership controls |
| **Follow-up Tracking** | `pages/FollowUps.tsx`, `backend/routers/follow_ups.py`, `backend/tasks/follow_ups.py` | Track post-submission status with automated checks, manual triggers, and check history |
| **Correspondence System** | `pages/Correspondence.tsx`, `backend/routers/correspondence.py` | Award notices, rejections, amendments with AI analysis (summary, sentiment, suggested actions) |
| **In-app Notifications** | Correspondence router notifications endpoints | Bell icon, unread counts, mark-read, auto-generated for awards |
| **News Feed** | `components/NewsFeed.tsx`, `backend/routers/feeds.py` | Market intelligence from NewsAPI with SSRF protection |
| **API Key Management** | `pages/Settings.tsx`, `backend/api_keys.py` | Encrypted storage, test connectivity, rotation |
| **FedRAMP Compliance Docs** | `docs/compliance/` | SSP, POA&M, NIST 800-53 Control Matrix |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, React Router 7 |
| **Backend** | Python 3.11, FastAPI, Celery, Redis |
| **Database** | Supabase PostgreSQL with Row-Level Security |
| **AI** | Anthropic Claude (primary), OpenAI GPT-4 (fallback), Google Gemini (fallback) |
| **Auth** | Supabase Auth — JWT, PKCE, TOTP MFA |
| **Encryption** | Fernet (AES-128-CBC + HMAC) for vault, HMAC-SHA256 for audit signing |
| **Automation** | OpenManus / browser-use for portal form filling |
| **Infrastructure** | Docker, nginx, GitHub Actions CI/CD |
| **Testing** | pytest (backend), vitest (frontend), Playwright (E2E) |

---

## Project Structure

```
procura-ops-command/
├── backend/                    # Python FastAPI backend
│   ├── ai/                     #   LLM client + qualification scoring
│   ├── automation/             #   OpenManus browser automation
│   ├── routers/                #   10 API route files
│   │   ├── opportunities.py    #     Discovery, qualification, CRUD
│   │   ├── submissions.py      #     Workflow, approvals, file upload
│   │   ├── admin.py            #     User management, metrics, config
│   │   ├── connectors.py       #     Credential vault, rotation
│   │   ├── documents.py        #     Document library
│   │   ├── follow_ups.py       #     Post-submission tracking
│   │   ├── correspondence.py   #     Awards, notifications, AI analysis
│   │   ├── audit.py            #     Tamper-evident log access
│   │   ├── feeds.py            #     News feed proxy
│   │   └── settings.py         #     User/system settings
│   ├── scrapers/               #   Discovery connectors (GovCon, SAM, USAspending)
│   ├── security/               #   Fernet vault + HMAC audit signing
│   ├── tasks/                  #   Celery workers (discovery, follow-ups)
│   ├── tests/                  #   61 pytest tests
│   ├── main.py                 #   FastAPI entry point
│   ├── config.py               #   Pydantic settings
│   ├── models.py               #   Pydantic schemas
│   └── Dockerfile              #   Production container
│
├── pages/                      # React route pages (13 pages)
│   ├── Dashboard.tsx           #   Opportunity pipeline + news feed
│   ├── AdminDashboard.tsx      #   Admin controls (users, discovery, AI, flags)
│   ├── SubmissionWorkspace.tsx  #   Proposal editor + checklist + approvals
│   ├── DocumentLibrary.tsx     #   Document management + upload
│   ├── Correspondence.tsx      #   Award tracking + AI analysis
│   ├── FollowUps.tsx           #   Post-submission monitoring
│   └── ...                     #   Settings, Audit, Submissions, Auth pages
│
├── components/                 # Reusable React components
├── lib/                        # API client, auth context, utilities
├── tests/                      # 21 vitest frontend tests
├── e2e/                        # 12 Playwright E2E spec files (~50 tests)
│
├── supabase/migrations/        # 6 SQL migration files
├── docs/compliance/            # FedRAMP SSP, POA&M, Control Matrix
│
├── docker-compose.yml          # Full stack (frontend, backend, celery, redis)
├── Dockerfile                  # Frontend: Vite build + nginx
├── nginx.conf                  # Reverse proxy + security headers
├── .github/workflows/ci.yml   # CI: tests, build, E2E, Docker
└── playwright.config.ts        # E2E test configuration
```

---

## API Endpoints (40+)

| Group | Endpoints | Auth |
|-------|-----------|------|
| **Opportunities** | `GET/POST /api/opportunities`, `PATCH /{id}`, `PATCH /{id}/disqualify`, `POST /sync`, `POST /{id}/qualify` | User |
| **Submissions** | `GET/POST /api/submissions`, `GET /{id}`, `PATCH /{id}`, `POST /{id}/approve`, `POST /{id}/reject`, `POST /{id}/finalize`, `POST /{id}/upload`, `PATCH /{id}/tasks/{task_id}` | Officer |
| **Documents** | `GET/POST /api/documents`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/versions` | Officer |
| **Follow-ups** | `GET/POST /api/follow-ups`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/check-now` | Officer |
| **Correspondence** | `GET/POST /api/correspondence`, `GET/PATCH /{id}`, `PATCH /{id}/status`, `POST /{id}/respond`, `POST /{id}/ai-analyze`, notifications endpoints | User |
| **Connectors** | `GET/POST /api/connectors`, `GET/PATCH/DELETE /{id}`, `POST /{id}/rotate`, `POST /{id}/test`, `GET /{id}/runs` | Admin |
| **Admin** | `GET/PATCH/DELETE /api/admin/users`, autonomy, health, metrics, discovery config, AI config, feature flags | Admin |
| **Audit** | `GET /api/audit-logs`, `GET /{id}/verify`, `GET /export/json` | Admin |
| **Settings** | `GET/PATCH /api/settings/profile`, `POST /api-keys`, `DELETE /api-keys/{id}` | User |
| **Feeds** | `GET /api/feeds/news` | User |
| **Health** | `GET /`, `GET /health` | Public |

---

## Security

### Implemented Controls

- **Authentication**: Supabase JWT with PKCE flow + TOTP MFA
- **Authorization**: Three-tier RBAC enforced at backend (dependency injection) and frontend (ProtectedRoute)
- **Row-Level Security**: PostgreSQL RLS policies on all tables
- **Encryption at rest**: Fernet (AES-128-CBC + HMAC) for connector credentials
- **Audit integrity**: HMAC-SHA256 signed log entries, admin-only access
- **Input validation**: Pydantic models, PostgREST injection sanitization, query parameter constraints
- **File upload security**: MIME allowlist, executable signature detection, streaming size limits, path traversal protection
- **Rate limiting**: slowapi middleware (Redis-backed in production, in-memory in dev)
- **SSRF protection**: Hostname allowlist on external API proxies
- **IDOR protection**: Ownership checks on all resource endpoints (documents, follow-ups, correspondence, submissions)
- **Error handling**: Generic messages in production (no stack trace leakage)

### Security Audit Summary (MCR Analysis)

113 findings identified and remediated:

| Severity | Count | Examples |
|----------|-------|---------|
| Critical | 7 | PostgREST filter injection, path traversal, audit log access, RBAC bypass |
| High | 15 | IDOR on 6 endpoint groups, SSRF, memory DoS via uploads, MIME bypass |
| Medium | 7 | Bare except clauses, unbounded queries, null guards, existence checks |
| Low | 3 | Debug logging cleanup, ErrorBoundary reset, dynamic copyright |

---

## Testing

```bash
# Backend unit tests (61 tests)
python -m pytest backend/tests/ -v

# Frontend unit tests (21 tests)
npm test

# E2E browser tests (~50 tests, requires Playwright browsers)
npm run test:e2e

# All tests
npm run test:all

# Build verification
npm run build
```

### E2E Test Coverage

| Spec File | Coverage |
|-----------|----------|
| `landing.spec.ts` | Login form, signup toggle, forgot password, validation |
| `auth.spec.ts` | Login/logout, invalid credentials, unauthenticated redirect |
| `dashboard.spec.ts` | Metrics, search, filters, row expansion, news feed |
| `navigation.spec.ts` | All 7 sidebar nav links |
| `submissions.spec.ts` | Queue, status filters, workspace loading |
| `documents.spec.ts` | Library, search, upload modal, validation |
| `correspondence.spec.ts` | Stats, filters, create modal, search |
| `follow-ups.spec.ts` | Status cards, refresh, empty state |
| `rbac.spec.ts` | Admin route blocking, access-denied page |
| `api-health.spec.ts` | Health endpoints, auth enforcement |
| `error-handling.spec.ts` | 404 page, error boundary |
| `settings.spec.ts` | Page sections, API keys, MFA |

---

## Quick Start

### Option 1: Docker (recommended)

```bash
# Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your Supabase credentials and API keys

# Start everything
docker compose up --build

# Access:
#   Frontend:  http://localhost:3000
#   Backend:   http://localhost:8001
#   API Docs:  http://localhost:8001/docs
```

### Option 2: Local Development

```bash
# Backend
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Edit backend/.env with credentials
uvicorn backend.main:app --port 8001 --reload

# Frontend (separate terminal)
npm install
cp .env.example .env.local
# Edit .env.local with Supabase URL and anon key
npm run dev

# Redis (separate terminal)
docker run -d -p 6379:6379 --name procura-redis redis:7-alpine
```

### Required Environment Variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-key          # For AI qualification
VAULT_ENCRYPTION_KEY=<generate>     # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
AUDIT_SIGNING_KEY=<generate>        # python -c "import secrets; print(secrets.token_hex(32))"
```

**Frontend** (`.env.local`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8001/api
```

---

## FedRAMP Compliance

FedRAMP Moderate compliance documentation is maintained in `docs/compliance/`:

| Document | Description |
|----------|-------------|
| [FedRAMP-SSP.md](docs/compliance/FedRAMP-SSP.md) | System Security Plan — architecture, data flow, 50+ NIST 800-53 controls mapped |
| [FedRAMP-POAM.md](docs/compliance/FedRAMP-POAM.md) | Plan of Action & Milestones — 15 open items, 14 completed remediations |
| [FedRAMP-Control-Matrix.md](docs/compliance/FedRAMP-Control-Matrix.md) | NIST 800-53 Rev 5 mapping across 18 control families |

---

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR:

1. **Backend tests** — pytest, Python compilation check
2. **Frontend tests** — vitest, Vite production build
3. **E2E tests** — Playwright with Chromium (requires CI secrets)
4. **Docker build** — Validates both images build (on main only)

---

## Database Migrations

```
supabase/migrations/
├── 01_schema.sql           # Core tables: profiles, opportunities, submissions, connectors
├── 02_rls_policies.sql     # Row-level security for all tables
├── 03_admin_tables.sql     # System settings, approval workflows, LLM cache
├── 04_fix_auth.sql         # Auth trigger fixes
├── 05_document_library_followups_correspondence.sql  # Extended features
└── 06_indexes_fk_rls_fixes.sql  # Performance indexes, FK constraints, RLS updates
```

Apply via Supabase CLI: `supabase db push` or execute manually in the Supabase SQL editor.

---

## License

Proprietary - All Rights Reserved

---

<div align="center">

**Built for government contractors who want to win more, faster.**

[Documentation](docs/) | [Architecture](docs/architecture/overview.md) | [Compliance](docs/compliance/)

</div>

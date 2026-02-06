# Procura — FedRAMP Plan of Action & Milestones (POA&M)

**System Name:** Procura Ops
**Date:** February 2026
**Impact Level:** Moderate

---

## Open Items

| ID | Control | Weakness | Risk | Milestone | Target Date | Status |
|----|---------|----------|------|-----------|-------------|--------|
| POA-001 | SC-8 | TLS termination not yet configured at infrastructure level | High | Configure TLS via cloud load balancer (ALB/CloudFront) or cert-manager + Let's Encrypt in Kubernetes | Q1 2026 | Open |
| POA-002 | SI-4 | No centralized logging/SIEM integration | Medium | Integrate structlog JSON output with Datadog, Splunk, or AWS CloudWatch. Add APM tracing. | Q1 2026 | Open |
| POA-003 | IR-4 | No formal incident response runbook | Medium | Document IR procedures, escalation paths, and communication templates. Conduct tabletop exercise. | Q1 2026 | Open |
| POA-004 | CP-9 | No automated database backup verification | Medium | Configure Supabase point-in-time recovery. Add weekly backup restore test to CI. | Q2 2026 | Open |
| POA-005 | SA-11 | E2E tests require live Supabase instance for full coverage | Low | Set up dedicated E2E test environment with seeded data. Add to CI secrets. | Q1 2026 | Open |
| POA-006 | SI-2 | No automated dependency vulnerability scanning | Medium | Enable Dependabot or Snyk on GitHub repository. Add `npm audit` and `pip audit` to CI. | Q1 2026 | Open |
| POA-007 | CA-8 | No penetration test conducted | High | Engage 3PAO for initial penetration test and vulnerability assessment. | Q2 2026 | Open |
| POA-008 | RA-5 | No runtime vulnerability scanning of containers | Medium | Add container scanning (Trivy/Grype) to Docker build step in CI pipeline. | Q1 2026 | Open |
| POA-009 | AU-6(1) | Audit log review is manual (admin UI only) | Low | Add automated alerting rules for suspicious patterns (bulk access, privilege escalation attempts). | Q2 2026 | Open |
| POA-010 | IA-5(1) | Password complexity not enforced at application level | Low | Supabase handles password policy. Add custom password strength indicator in signup form. Document minimum requirements. | Q2 2026 | Open |
| POA-011 | AC-2(4) | No automated account disabling for inactivity | Low | Add scheduled task to flag/disable accounts with >90 days inactivity. | Q2 2026 | Open |
| POA-012 | SC-7 | No Web Application Firewall (WAF) | Medium | Deploy AWS WAF or Cloudflare WAF rules for OWASP Top 10 protection. | Q2 2026 | Open |
| POA-013 | PS-6 | No access agreement/terms of service enforcement | Low | Add mandatory ToS acceptance on first login. Store acceptance timestamp. | Q2 2026 | Open |
| POA-014 | CP-2 | No documented contingency/disaster recovery plan | Medium | Document RTO/RPO targets, failover procedures, and communication plan. | Q2 2026 | Open |
| POA-015 | SA-9 | No formal data processing agreements with AI providers | High | Execute DPAs with Anthropic, OpenAI, and Google covering CUI handling, data retention, and breach notification. | Q1 2026 | Open |

---

## Completed Remediation (from MCR Security Audit)

| ID | Control | Weakness | Resolution | Date |
|----|---------|----------|------------|------|
| REM-001 | SI-10 | SQL/PostgREST filter injection in 5 routers | Sanitized all search inputs, stripped control characters | Feb 2026 |
| REM-002 | AC-3 | IDOR vulnerabilities in 6 endpoint groups | Added ownership checks (assigned_to, uploaded_by, sender/recipient) | Feb 2026 |
| REM-003 | SI-3 | Path traversal via unsanitized filenames | `Path(name).name.lstrip(".")` sanitization on all uploads | Feb 2026 |
| REM-004 | AC-6 | Audit logs accessible to all authenticated users | Changed to `require_admin` dependency | Feb 2026 |
| REM-005 | AC-3 | No RBAC on frontend admin routes | Added `allowedRoles` prop to ProtectedRoute | Feb 2026 |
| REM-006 | IA-8 | Supabase client created with empty credentials | Added `supabaseConfigured` guard with fail-fast UI | Feb 2026 |
| REM-007 | SI-5 | Raw exception messages leaked in HTTP responses | Replaced `str(e)` with generic messages in 3 routers | Feb 2026 |
| REM-008 | SC-7 | SSRF via configurable NEWS_API_BASE | Added hostname allowlist validation | Feb 2026 |
| REM-009 | SI-3 | File upload buffered entirely before size check | Implemented streaming chunked reads with early rejection | Feb 2026 |
| REM-010 | SI-3 | MIME allowlist bypass via application/octet-stream | Removed catch-all MIME type from allowlist | Feb 2026 |
| REM-011 | AC-2 | User deletion didn't remove Supabase Auth record | Added `auth.admin.delete_user()` call on user deletion | Feb 2026 |
| REM-012 | SI-10 | No enum validation on follow-up status updates | Added VALID_STATUSES check with 400 error | Feb 2026 |
| REM-013 | AC-7 | Rate limiter defined but not wired as middleware | Wired slowapi with Redis-backed storage in production | Feb 2026 |
| REM-014 | AU-3 | Silent error swallowing in 10 frontend catch blocks | Replaced with error state and user-visible feedback | Feb 2026 |

---

## Risk Acceptance

The following items are accepted risks with compensating controls:

| Item | Risk | Compensating Control |
|------|------|---------------------|
| In-memory rate limiter in development | Per-process state not shared | Redis-backed in production (`ENVIRONMENT=production`) |
| HashRouter instead of BrowserRouter | URL fragments not logged by proxy servers | Application-level request logging captures all API calls |
| `any` TypeScript types in some components | Reduced type safety | Runtime validation via Pydantic on backend; planned TypeScript strict mode migration |
| AI provider API calls cross trust boundary | CUI data sent to external LLM | Use zero-retention API agreements; only send opportunity metadata (not PII); DPA required (POA-015) |

---

## Authorization Timeline

| Phase | Activity | Target |
|-------|----------|--------|
| Phase 1 | Complete POA&M open items POA-001 through POA-006 | Q1 2026 |
| Phase 2 | 3PAO initial assessment (POA-007) | Q2 2026 |
| Phase 3 | Remediate 3PAO findings | Q2 2026 |
| Phase 4 | Submit FedRAMP package to JAB/Agency | Q3 2026 |
| Phase 5 | Provisional ATO | Q3 2026 |
| Phase 6 | Continuous monitoring (monthly scans, annual assessment) | Ongoing |

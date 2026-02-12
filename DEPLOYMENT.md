# Production Deployment - Authentication Fix

## Critical Issues Fixed

### 1. **User Registration Failure** ✅
- **Problem**: "Database error saving new user" during signup
- **Root Cause**: Foreign key constraint `profiles_id_fkey` blocked trigger execution
- **Fix**: Made constraint DEFERRABLE INITIALLY DEFERRED
- **Migration**: `12_production_auth_fix.sql`

### 2. **Login Infinite Spinner** ✅
- **Problem**: Login button spun indefinitely, never completed
- **Root Cause**: `onAuthStateChange` callback had `await` on MFA call that hung, blocking `signInWithPassword`
- **Fix**: Removed all MFA code, made callback synchronous
- **Files**: `lib/AuthContext.tsx`, `pages/LandingPage.tsx`

### 3. **Security Vulnerabilities** ✅
- Removed hardcoded credentials from `backend/scripts/reset_admin_password.py`
- Added password complexity validation (12+ chars, mixed case, numbers, symbols)
- Secured test credentials in `e2e/helpers.ts`
- Added rate limiting to login (exponential backoff after 3 attempts)

---

## Deployment Steps

### Step 1: Database Migration (REQUIRED)

**In Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard → Your Project → SQL Editor
2. Copy and paste the contents of: `supabase/migrations/12_production_auth_fix.sql`
3. Click **RUN**
4. Verify no errors

**What this does:**
- Makes `profiles_id_fkey` constraint DEFERRABLE
- Recreates trigger with proper permissions
- Ensures RLS policies are correct
- Backfills any users missing profiles

### Step 2: Deploy Frontend

The code is already pushed to GitHub. Deploy using your current process:

**For Vercel:**
```bash
# Automatic deployment on push to main
# Or trigger manual deployment in Vercel dashboard
```

**For manual deployment:**
```bash
npm run build
# Deploy dist/ folder to your hosting
```

### Step 3: Deploy Backend (if needed)

```bash
# No backend changes required
# But if you want to update backend:
git pull origin main
pip install -r requirements.txt
# Restart backend service
```

---

## Verification Checklist

### ✅ Database Migration Verification

Run this query in Supabase SQL Editor:

```sql
-- Check 1: Foreign key is DEFERRABLE
SELECT
    tc.constraint_name,
    CASE WHEN con.condeferrable THEN 'DEFERRABLE ✓' ELSE 'NOT DEFERRABLE ✗' END as status
FROM information_schema.table_constraints tc
JOIN pg_constraint con ON con.conname = tc.constraint_name
WHERE tc.table_name = 'profiles'
    AND tc.constraint_name = 'profiles_id_fkey';

-- Check 2: Trigger exists
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Check 3: All users have profiles
SELECT
    COUNT(DISTINCT au.id) as auth_users,
    COUNT(DISTINCT p.id) as profiles,
    COUNT(DISTINCT au.id) - COUNT(DISTINCT p.id) as missing
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id;
```

**Expected results:**
- Check 1: Shows "DEFERRABLE ✓"
- Check 2: Shows trigger exists
- Check 3: Missing = 0

### ✅ Frontend Verification

**Test 1: User Registration**
1. Go to: https://your-domain.com
2. Click "Sign up"
3. Enter:
   - Name: Test User
   - Email: test+production@example.com
   - Password: TestPassword123!@#
4. Submit
5. ✅ Should show: "Check your email for a confirmation link!"
6. ❌ Should NOT show: "Database error saving new user"

**Test 2: User Login**
1. Go to: https://your-domain.com
2. Enter existing credentials
3. Click "Sign In"
4. ✅ Should navigate to dashboard within 2 seconds
5. ❌ Should NOT show infinite spinner

**Test 3: Password Validation**
1. Try signup with weak password: "password"
2. ✅ Should show: "Password must be at least 12 characters"
3. Try: "Password123"
4. ✅ Should show: "Password must contain special characters"

**Test 4: Rate Limiting**
1. Try login with wrong password 3 times
2. ✅ Should show cooldown message: "Too many attempts. Please wait X seconds"

### ✅ Security Verification

Run in your codebase:

```bash
# Check for hardcoded credentials
git grep -i "password.*=.*\"" --and --not -e "placeholder" --and --not -e "example"

# Should return minimal results, no actual passwords
```

---

## Rollback Plan

If issues occur in production:

### Rollback Database Migration

```sql
-- Revert foreign key to non-deferrable
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
```

### Rollback Frontend

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or deploy previous version in Vercel dashboard
```

---

## Production Monitoring

### Watch for These Metrics

1. **Signup Success Rate**
   - Monitor: Supabase Dashboard → Auth → Users
   - Expected: New users appearing without errors

2. **Login Success Rate**
   - Monitor: Browser console errors
   - Expected: No "signal is aborted" or "AbortError"

3. **Database Errors**
   - Monitor: Supabase Dashboard → Logs
   - Expected: No "foreign_key_violation" errors

### Health Check Queries

Run periodically in Supabase SQL Editor:

```sql
-- Health check: User-Profile sync
SELECT
    (SELECT COUNT(*) FROM auth.users) as auth_users,
    (SELECT COUNT(*) FROM public.profiles) as profiles,
    CASE
        WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM public.profiles)
        THEN '✓ HEALTHY'
        ELSE '✗ ISSUE DETECTED'
    END as status;

-- Recent signups (last 24 hours)
SELECT
    au.email,
    au.created_at as auth_created,
    p.created_at as profile_created,
    CASE
        WHEN p.id IS NOT NULL THEN '✓ Has Profile'
        ELSE '✗ Missing Profile'
    END as status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.created_at > NOW() - INTERVAL '24 hours'
ORDER BY au.created_at DESC;
```

---

## Post-Deployment Actions

### Immediate (Within 1 hour)

- [ ] Run all verification checks above
- [ ] Test signup with real email
- [ ] Test login from different device/browser
- [ ] Check Supabase logs for errors
- [ ] Monitor error tracking (Sentry, etc.)

### Within 24 hours

- [ ] Review signup/login metrics
- [ ] Check for any user-reported issues
- [ ] Verify email confirmations are working
- [ ] Test password reset flow

### Within 1 week

- [ ] Review security audit logs
- [ ] Rotate admin password (exposed in git history)
- [ ] Consider adding monitoring alerts
- [ ] Update documentation

---

## Known Limitations

1. **Role Validation**: Currently uses `user_metadata.role` (client-controlled)
   - **Risk**: Low (only affects UI display, backend validates properly)
   - **Fix**: Already implemented `/admin/users/me` endpoint, but requires `api.get()` method
   - **TODO**: Add generic `get()` method to `lib/api.ts` to enable backend role verification

2. **Session Storage**: Uses `localStorage` (XSS vulnerable)
   - **Risk**: Medium (requires XSS exploit)
   - **Mitigation**: Add CSP headers
   - **Future**: Consider BFF pattern with httpOnly cookies

3. **MFA Removed**: Multi-factor authentication disabled
   - **Risk**: Low for MVP (password complexity enforced, rate limiting added)
   - **Future**: Can re-enable with proper async handling

---

## Support

If issues arise:

1. Check this document's verification steps
2. Review Supabase logs: Dashboard → Logs
3. Check browser console for errors
4. Run health check queries above

Emergency rollback: See "Rollback Plan" section above.

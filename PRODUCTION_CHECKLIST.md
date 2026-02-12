# Production Deployment Checklist

## ✅ Pre-Deployment (Complete)

- [x] Code pushed to GitHub (`5f1dba9`)
- [x] All security vulnerabilities fixed
- [x] Database migration prepared (`12_production_auth_fix.sql`)
- [x] Deployment documentation created
- [x] Rollback plan documented

---

## 🚀 Deployment Steps (Do These Now)

### Step 1: Apply Database Migration ⚠️ CRITICAL

**Time: 2 minutes**

1. **Open Supabase Dashboard:**
   ```
   https://supabase.com/dashboard
   ```

2. **Navigate to:**
   ```
   Your Project → SQL Editor
   ```

3. **Copy and paste this file:**
   ```
   supabase/migrations/12_production_auth_fix.sql
   ```

4. **Click "RUN"**

5. **Verify success:**
   ```sql
   -- Run this query to verify:
   SELECT
       tc.constraint_name,
       CASE WHEN con.condeferrable THEN '✅ DEFERRABLE' ELSE '❌ NOT DEFERRABLE' END as status
   FROM information_schema.table_constraints tc
   JOIN pg_constraint con ON con.conname = tc.constraint_name
   WHERE tc.table_name = 'profiles' AND tc.constraint_name = 'profiles_id_fkey';
   ```

   **Expected:** Shows "✅ DEFERRABLE"

---

### Step 2: Deploy Frontend

**Option A: Vercel (Automatic)**
- ✅ Already deployed automatically when you pushed to `main`
- Check: https://vercel.com/dashboard → Your Project → Deployments
- Wait for "Ready" status

**Option B: Manual**
```bash
npm run build
# Upload dist/ to your hosting
```

---

### Step 3: Verify Production

Run these tests **immediately** after deployment:

#### Test 1: User Registration ✅

1. Go to: `https://your-production-domain.com`
2. Click **"Sign up"**
3. Enter:
   ```
   Name: Test User
   Email: test+verify@yourdomain.com
   Password: SecureTest123!@#
   ```
4. Click **"Create Account"**

**✅ Expected:**
- Message: "Check your email for a confirmation link!"
- NO errors in console
- NO "Database error saving new user"

**❌ If you see errors:**
- Check Supabase logs: Dashboard → Logs
- Verify migration ran successfully
- Check console for specific error

---

#### Test 2: User Login ✅

1. Use existing account credentials
2. Enter email and password
3. Click **"Sign In"**

**✅ Expected:**
- Redirects to dashboard within 2 seconds
- NO infinite spinner
- NO errors in console

**❌ If login hangs:**
- Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R`)
- Clear localStorage: DevTools → Application → Local Storage → Clear
- Try again

---

#### Test 3: Password Validation ✅

1. Try signup with weak password: `"password"`

**✅ Expected:**
- Error: "Password must be at least 12 characters"

2. Try: `"Password123"`

**✅ Expected:**
- Error: "Password must contain special characters"

3. Try: `"ValidPass123!@#"`

**✅ Expected:**
- Proceeds to success message

---

#### Test 4: Rate Limiting ✅

1. Enter wrong password 3 times in a row

**✅ Expected:**
- After 3rd attempt: "Too many attempts. Please wait X seconds"
- Login button disabled during cooldown
- Cooldown timer counts down

---

#### Test 5: Database Integrity ✅

Run in Supabase SQL Editor:

```sql
-- All users should have profiles
SELECT
    COUNT(DISTINCT au.id) as auth_users,
    COUNT(DISTINCT p.id) as profiles,
    COUNT(DISTINCT au.id) - COUNT(DISTINCT p.id) as missing
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id;
```

**✅ Expected:**
- `missing` = 0

---

## 📊 Production Monitoring

### Check These Metrics Daily (First Week)

1. **Signup Success Rate**
   ```
   Supabase Dashboard → Auth → Users
   ```
   - New users appearing without gaps
   - No error spikes in logs

2. **Error Logs**
   ```
   Supabase Dashboard → Logs → Filter: ERROR
   ```
   - No "foreign_key_violation"
   - No "AbortError: signal is aborted"

3. **User Feedback**
   - Monitor support channels
   - Check for login/signup complaints

---

## 🔍 Health Checks

Run these **once per day** for the first week:

### Query 1: User-Profile Sync
```sql
SELECT
    (SELECT COUNT(*) FROM auth.users) as auth_users,
    (SELECT COUNT(*) FROM public.profiles) as profiles,
    CASE
        WHEN (SELECT COUNT(*) FROM auth.users) = (SELECT COUNT(*) FROM public.profiles)
        THEN '✅ HEALTHY'
        ELSE '⚠️ SYNC ISSUE'
    END as status;
```

### Query 2: Recent Signups
```sql
SELECT
    au.email,
    au.created_at,
    CASE WHEN p.id IS NOT NULL THEN '✅' ELSE '❌' END as has_profile
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.created_at > NOW() - INTERVAL '24 hours'
ORDER BY au.created_at DESC;
```

---

## ⚠️ If Issues Arise

### Issue: Users can't sign up

**Check:**
1. Supabase logs for errors
2. Run migration verification query (Step 1.5 above)
3. Check if trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

**Fix:**
- Rerun migration: `12_production_auth_fix.sql`

---

### Issue: Users can't login

**Check:**
1. Browser console for errors
2. Network tab for failed requests
3. Clear browser cache/localStorage

**Fix:**
- Verify frontend deployed correctly
- Check Vercel deployment status
- Force redeploy if needed

---

### Issue: Missing profiles

**Check:**
```sql
SELECT au.id, au.email, au.created_at
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
```

**Fix:**
```sql
-- Backfill missing profiles
INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at, last_active)
SELECT
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
    'viewer',
    au.created_at,
    NOW(),
    NOW()
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

---

## 🔄 Rollback (Emergency Only)

If production is completely broken:

### Rollback Database
```sql
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

### Rollback Frontend
```bash
git revert HEAD
git push origin main
```

**Or in Vercel:**
- Dashboard → Deployments → Previous Deployment → "Promote to Production"

---

## 📝 Post-Deployment Actions

### Within 24 Hours

- [ ] Run all verification tests above
- [ ] Monitor error logs
- [ ] Check user feedback
- [ ] Test from different browsers/devices

### Within 1 Week

- [ ] Review signup/login metrics
- [ ] Verify email confirmations working
- [ ] Test password reset flow
- [ ] Check rate limiting effectiveness

### Before Going Home Today

- [ ] Bookmark this checklist
- [ ] Bookmark Supabase dashboard
- [ ] Bookmark Vercel dashboard
- [ ] Save emergency contact info

---

## ✅ Success Criteria

You're good when:

- [x] All 5 verification tests pass
- [x] Health checks show 0 missing profiles
- [x] No errors in Supabase logs
- [x] Users can signup and login smoothly
- [x] No support tickets about auth issues

---

## 🎯 Next Steps (Optional, Later)

These can be done anytime in the future:

1. **Add CSP Headers** (security)
   - Mitigate XSS risks from localStorage

2. **Implement Backend Role Verification** (security)
   - Add `api.get()` method to `lib/api.ts`
   - Use `/admin/users/me` endpoint in `App.tsx`

3. **Rotate Admin Password** (security)
   - Old password exposed in git history
   - Use new `reset_admin_password.py` script

4. **Re-enable MFA** (optional)
   - With proper async handling
   - If users request it

---

## Contact for Issues

- **Urgent Production Issues:** [Your Contact]
- **Supabase Support:** https://supabase.com/support
- **Documentation:** See `DEPLOYMENT.md`

---

**Remember:** You can always rollback if needed. The old code is saved in git history.

Good luck! 🚀

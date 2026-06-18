# Supabase Dashboard Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the single approved Supabase account to authenticate before the UI or any dashboard API can be accessed.

**Architecture:** A focused server auth module owns cookie parsing, allowlist checks, Supabase sign-in/session refresh, and Express middleware. React mounts dashboard data fetching only after `/api/auth/session` succeeds and otherwise renders a responsive login surface.

**Tech Stack:** Node.js, Express, Supabase Auth, React 19, Vite, Node test runner, HTTP-only cookies.

---

### Task 1: Cookie and allowlist primitives

**Files:**
- Create: `test/auth.test.js`
- Create: `server/auth.js`

- [ ] **Step 1: Write failing tests for normalized allowlist checks, cookie parsing, secure cookie serialization, and cookie clearing.**

```js
assert.equal(isAuthorizedEmail("TestW065@gmail.com"), true);
assert.equal(isAuthorizedEmail("another@example.com"), false);
assert.deepEqual(parseCookies("a=1; dl_access_token=abc"), { a: "1", dl_access_token: "abc" });
assert.match(sessionCookie("dl_access_token", "abc", { secure: true }), /HttpOnly; SameSite=Lax; Secure/);
```

- [ ] **Step 2: Run `node --test test/auth.test.js` and verify it fails because `server/auth.js` is missing.**
- [ ] **Step 3: Implement the pure helpers with `AUTHORIZED_EMAIL = "testw065@gmail.com"`, URL-safe cookie encoding, and production-only `Secure`.**
- [ ] **Step 4: Run `node --test test/auth.test.js` and require all tests to pass.**

### Task 2: Supabase session service and protected API boundary

**Files:**
- Modify: `server/auth.js`
- Modify: `server/supabase.js`
- Modify: `server/index.js`
- Modify: `.env.example`
- Test: `test/auth.test.js`

- [ ] **Step 1: Add failing dependency-injected middleware tests showing missing cookies return `401`, an authorized user calls `next()`, and an unauthorized email clears cookies.**
- [ ] **Step 2: Run `node --test test/auth.test.js` and confirm the middleware tests fail for missing behavior.**
- [ ] **Step 3: Add server-only Supabase helpers for password sign-in, access-token lookup, refresh, sign-out, and Admin user provisioning.**
- [ ] **Step 4: Add public `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout` routes before the middleware.**
- [ ] **Step 5: Mount authentication middleware before source, upload, dashboard, status, and refresh routes so every existing dashboard API is protected.**
- [ ] **Step 6: Add `AUTHORIZED_EMAIL=testw065@gmail.com` to `.env.example` without adding any password or secret.**
- [ ] **Step 7: Run `node --test test/auth.test.js` and require all tests to pass.**

### Task 3: React authentication boundary and login screen

**Files:**
- Create: `src/authClient.js`
- Create: `src/components/LoginScreen.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Create: `test/authClient.test.js`

- [ ] **Step 1: Write failing tests for normalized auth API errors and unauthorized-response detection.**
- [ ] **Step 2: Run `node --test test/authClient.test.js` and verify it fails because the client helper is missing.**
- [ ] **Step 3: Implement `getSession`, `login`, `logout`, and a small JSON response helper using same-origin cookies.**
- [ ] **Step 4: Implement a login form prefilled only with the approved email, with password visibility, loading, and inline errors.**
- [ ] **Step 5: Add checking/logged-out/authenticated states above the dashboard component and mount `useDashboardData` only inside the authenticated branch.**
- [ ] **Step 6: Replace `Demo User` with the authenticated email and a logout button.**
- [ ] **Step 7: Add responsive login styling and visible focus states without embedding the password.**
- [ ] **Step 8: Run `node --test test/authClient.test.js` and require all tests to pass.**

### Task 4: Provision the approved Supabase account

**Files:**
- No repository file stores the supplied password.

- [ ] **Step 1: Use the Supabase Admin API with the existing server-only service key to find `testw065@gmail.com`.**
- [ ] **Step 2: Create the user if absent or update the existing user password, setting `email_confirm: true`.**
- [ ] **Step 3: Verify password sign-in returns the approved email, then discard all token and password values from the working context.**

### Task 5: End-to-end verification

**Files:**
- Modify only if a failing verification exposes a defect.

- [ ] **Step 1: Run `npm test` and require zero failures.**
- [ ] **Step 2: Run `npm run build` and require a successful production bundle.**
- [ ] **Step 3: Verify unauthenticated `GET /api/dashboard` returns `401`.**
- [ ] **Step 4: In the browser, verify login with the approved account opens the dashboard and displays its email.**
- [ ] **Step 5: Reload and verify the secure session persists, then logout and verify the dashboard and protected APIs are inaccessible.**
- [ ] **Step 6: Verify login layout and controls at desktop and mobile widths with no horizontal overflow or relevant console errors.**
- [ ] **Step 7: Run `git diff --check` and scan tracked files to confirm the password and service-role key were not written to the repository.**

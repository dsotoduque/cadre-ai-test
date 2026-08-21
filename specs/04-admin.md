# Spec 04: Admin Gate & Leads View

Status: ✅ Implemented and verified locally against all 7 acceptance criteria.
Module: `auth` (thin, per `CLAUDE.md`'s locked decision), `users` (adds a read use-case).

## Problem

Escalated conversations land in `leads`, but nothing lets the Cadre AI team actually see them.
This spec builds the minimum viewer: a single protected page listing leads, gated by the
env-secret mechanism already locked in `CLAUDE.md` — not full Supabase Auth (see README
trade-off table for why that's deferred).

## Design decisions

### 1. Gate mechanism: cookie-based, not HTTP Basic Auth or a query param

A login form at `/admin/login` posts the secret to `POST /api/admin/login`. On match against
`ADMIN_SECRET`, the server sets an `httpOnly`, `secure`, `sameSite: lax` cookie and redirects to
`/admin`. `middleware.ts` protects every `/admin/*` path except `/admin/login` itself, redirecting
to the login page when the cookie is missing or wrong.

Rejected alternatives:
- **Browser-native HTTP Basic Auth** — no real login/logout UX, awkward to clear a session.
- **Secret as a query param** — ends up in browser history and server logs; a real (if minor)
  leak vector for no benefit over a cookie.

### 2. Session storage: the secret itself, in the cookie — a deliberate trade-off

The cookie's value is the `ADMIN_SECRET` value itself (not a generated session token backed by
a database row). Verification is a direct string comparison against `env.adminSecret`. This
means there's no server-side session table, no expiry-refresh logic, no revocation mechanism
beyond the cookie's `maxAge` (8h) and clearing it on logout.

This is intentionally minimal, consistent with `CLAUDE.md`'s "simple env-secret gate, not full
Supabase Auth" — building real session management for one internal view isn't worth it in v1.
Documented explicitly (not silently skipped) because it's a real security trade-off: if the
cookie leaks, the attacker has the actual admin secret, not a revocable token. Acceptable given
this gates a read-only leads list with no further write/delete actions in v1, and HTTPS
(Vercel default) plus `httpOnly`/`secure` bounds the exposure. Full session management is the
natural first step of "real auth for `/admin`" already on the README roadmap.

### 3. No brute-force protection on `/api/admin/login`

Rate limiting is already deferred project-wide (README roadmap item 1). Calling it out
specifically here because a login endpoint is a more sensitive target than `/api/chat` — noted
as a known gap rather than assumed covered by the general rate-limiting deferral.

### 4. Leads view scope: list only, no conversation transcript viewer

`/admin` shows a table: question, email (or "—"), status, created_at, newest first. It does
**not** show the linked conversation's message history, even though `messages` has the data via
`conversation_id` — that's a real nice-to-have, cut for v1 scope. Noted as a natural follow-up,
not built now.

### 5. New `users` use case: `listLeads()`

`users/application/list-leads.ts` calls a new `users/infrastructure/leads-repository.ts` function
(`findAllLeads()`) — ordered by `created_at desc`. Uses the same service-role Supabase client as
the rest of the app; there's no per-admin-user Supabase Auth identity to scope by.

## Implementation finding: `/admin` needs to be forced dynamic

Found via `npm run build`, not visible from `npm run dev` or the design: Next.js had no dynamic
API call to detect in `app/admin/page.tsx` (the auth check lives in `middleware.ts`, not the
page itself), so it prerendered `/admin` once at build time as a static page. The leads list
would have frozen at that build-time snapshot in production — new leads created after deploy
would never appear without a full redeploy. Fixed with `export const dynamic = "force-dynamic"`
on the page. `/admin/login` is correctly left static — it has no data fetch.

## Acceptance criteria

1. Visiting `/admin` without a valid session cookie redirects to `/admin/login`.
2. Submitting the correct secret at `/admin/login` sets the cookie and redirects to `/admin`,
   which then renders the leads list.
3. Submitting an incorrect secret shows an error, sets no cookie, grants no access.
4. `/admin` lists leads newest-first with question, email, status, created_at.
5. Logging out clears the cookie; a subsequent visit to `/admin` redirects to `/admin/login`.
6. `ADMIN_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` never reach the client — no `NEXT_PUBLIC_`
   prefix, never embedded in rendered HTML or the JS bundle (server components / route handlers
   only).
7. `middleware.ts` protects all `/admin/*` paths except `/admin/login` (no redirect loop).

## Plan

- [x] `modules/auth/application/verify-admin-session.ts`: compare a cookie value to
      `env.adminSecret`.
- [x] `modules/auth/application/attempt-admin-login.ts`: validate a submitted secret.
- [x] `middleware.ts`: protect `/admin/*` except `/admin/login`.
- [x] `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts`.
- [x] `app/admin/login/page.tsx`: simple form.
- [x] `modules/users/infrastructure/leads-repository.ts`: add `findAllLeads()`.
- [x] `modules/users/application/list-leads.ts`.
- [x] `app/admin/page.tsx`: server component rendering the leads table (forced dynamic, see
      implementation finding above).
- [x] Manually tested all 7 acceptance criteria via curl against the local dev server + a real
      escalation-created lead — all pass.

**Checkpoint:** gate mechanism and leads view verified against all acceptance criteria. Ready to
start `05-ui-deploy.md` (the chat widget UI + deploy) once approved.

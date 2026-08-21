# Spec 05: Chat UI & Deployment

Status: DRAFT — needs review before the Plan checklist below is executed.
Modules: none new — this is `app/page.tsx` (interface layer, calls `POST /api/chat`) plus
deployment/infra work. No new domain logic.

## Problem

Everything up to here is reachable via curl. This spec builds the actual chat interface a
prospective client would use, and gets the app + database live on a public URL — the two hard
deliverables for the take-home.

## Design decisions

### 1. Full-page chat, not an embedded floating widget

`app/page.tsx` becomes a dedicated, full-page chat interface — not a floating bubble that
toggles open/closed. A floating-widget pattern only makes sense when embedding into an existing
host site (positioning, z-index, toggle state, mobile edge cases); there's no host page here,
this app *is* the deliverable. Building the floating-widget chrome would be pure UI overhead for
zero functional benefit in this context.

### 2. Hand-rolled UI with Tailwind, no component library

Tailwind is already in the scaffold. Given the UI surface is small (message list, input, send
button, loading/error states), pulling in a component library (e.g. shadcn/ui) costs setup time
for no real benefit at this scope. The take-home FAQ explicitly allows component libraries, but
"allowed" isn't "worth it" here — this is a "3 working features > 8 broken ones" cut.

### 3. Client-side state: in-memory only, lost on refresh

`conversationId` and the message list live in `useState`, not `localStorage`. A page refresh
starts a new conversation. This is an accepted v1 cut — persisting session state across reloads
is a real feature (and interacts with the escalation/lead flow: would a refreshed, "lost" session
still let someone resume a conversation that already escalated?) that isn't worth the design
time in this pass. Noted as a natural follow-up.

### 4. Escalation gets no special visual treatment

An escalated turn's `acknowledgment` renders as a normal assistant message bubble — no separate
badge, color, or icon. The acknowledgment text itself already communicates what happened. Keeps
the UI surface small; a visual distinction is a cheap future addition if it proves valuable, not
a v1 requirement.

### 5. Deployment: Vercel (CLI) + Supabase Cloud

- Vercel project already created via the dashboard; remaining work (env vars, deploys) goes
  through the CLI per the developer's preference.
- Supabase Cloud project: link the local CLI to it, apply both migrations
  (`20260820000000_init.sql`, `20260820000001_grants.sql`), then run `npm run ingest` pointed at
  the cloud project's credentials to seed the KB there (local and cloud KBs are independent —
  ingestion has to run again against the new target).
- Env vars set in Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`,
  `ADMIN_SECRET` — same four as `.env.local`, pointed at cloud values. No `NEXT_PUBLIC_*`
  variants needed anywhere in this app (confirmed throughout: the browser never talks to
  Supabase or OpenRouter directly).

## Acceptance criteria

1. Visiting `/` shows an empty chat interface ready for input — no console errors.
2. Sending a message shows the user's message immediately, then the assistant's response once
   it resolves.
3. `conversationId` persists across multiple messages in the same browser session (same ID sent
   on the second request).
4. An escalated response renders as a normal assistant message, no UI break.
5. A simulated network/server failure shows a graceful inline error, not a crash or a stuck
   spinner.
6. The deployed Vercel URL is publicly reachable and a full chat turn works end-to-end against
   the cloud Supabase project (not local).
7. `/admin` login and the leads view work identically on the deployed URL.
8. No secret (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `ADMIN_SECRET`) appears in the
   deployed site's page source or JS bundles.

## Plan

- [ ] Build `app/page.tsx`: message list, input, send, loading state, error state.
- [ ] Manually test the UI locally against local Supabase + OpenRouter (criteria 1-5).
- [ ] Get the Supabase Cloud project ref; `supabase link`; apply both migrations to the cloud
      project.
- [ ] Run `npm run ingest` against the cloud project's credentials to seed the KB there.
- [ ] Set the four env vars in Vercel via CLI, pointed at cloud values.
- [ ] Deploy via the Vercel CLI.
- [ ] Smoke test the deployed URL against criteria 6-8, plus a handful of the 10 scenarios from
      `specs/00-product-spec.md`.
- [ ] Update `README.md` with the live URL and finalize "Running locally" if anything changed.

**Checkpoint:** review the deployed app against all acceptance criteria. This is the last spec
before submission — after this, remaining work is polish (`plan.md` Phase 9), not new features.

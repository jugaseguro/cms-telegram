# Technical Health Report

Audit date: 2026-03-24

## Executive Summary

The app is functional and the recent freeze fixes improved the most visible failures, but the system still carries high operational complexity around auth recovery, realtime delivery, and cross-runtime consistency.

The main pattern is not a single broken subsystem. The risk comes from overlapping mechanisms:

- Supabase Realtime plus Socket.IO plus polling plus visibility-based recovery
- optimistic UI plus server delivery plus query invalidation fan-out
- a web panel and bot that share domain behavior but do not share contracts or runtime defaults
- schema, manual types, and migrations that can drift over time

The repo is strongest in business behavior coverage and weakest in prevention:

- there was no project test suite before this branch
- there was no CI workflow before this branch
- observability is mostly `console.*`
- health checking was previously limited to the bot server `/health`

## Domain Scorecard

| Domain | Status | Risk | Notes |
| --- | --- | --- | --- |
| Auth and session | Yellow | High | Recovery logic is now more defensive, but auth bootstrap and hard redirects still carry complexity. |
| Realtime and socket | Red | Very High | Polling, Supabase Realtime, Socket.IO, and recovery overlap in ownership. |
| Queries and mutations | Yellow | High | Timeouts improved, but invalidation patterns remain aggressive and broad. |
| API contracts | Yellow | High | APIs work, but request validation and error contracts are not standardized. |
| Supabase schema and RLS | Yellow | Medium-High | RLS exists broadly, but type/schema drift risk is real. |
| Bot and AI runtime | Yellow | High | Hot-update behavior and defaults are inconsistent with initial load. |
| Deploy and secrets | Yellow | Medium-High | Split runtime across Netlify and external socket host with limited diagnostics. |
| Observability | Red | Very High | No central logging, metrics, traces, or alerting contract in repo. |
| Testing and CI | Yellow | High | A baseline was added in this branch, but coverage is still minimal and mostly smoke-level. |
| Performance and maintainability | Yellow | High | The app can work well, but complexity budget is already stretched. |

## Priority Findings

| Severity | Area | Finding | Evidence | Impact |
| --- | --- | --- | --- | --- |
| P1 | Testing and CI | Coverage is still shallow even after adding smoke tests and CI foundation. | This branch adds Playwright smoke tests and a CI workflow, but broad behavioral coverage is still missing. | Regressions in edge cases can still ship silently, especially around long-lived chats and admin workflows. |
| P0 | Observability | The system has no structured logging, metrics, tracing, or incident hooks in repo. | Most failures resolve to `console.warn` or `console.error`; no Sentry, Datadog, PostHog, or OpenTelemetry usage found. | Intermittent failures are hard to diagnose, compare, or alert on. |
| P0 | Realtime architecture | Live updates are split across Supabase Realtime, Socket.IO, polling, and visibility recovery. | `src/hooks/use-realtime.ts`, `src/hooks/use-session-recovery.ts`, `src/hooks/use-socket.ts`, `src/hooks/use-socket-conversations.ts`, `bot/src/socket-server.ts`. | Freeze risk, duplicate work, hidden race conditions, and harder debugging. |
| P1 | Query invalidation | The app relies on broad invalidation in many mutation and realtime paths. | Repeated `invalidateQueries` across hooks and components including chats, admin, transactions, and labels. | Extra network churn, cache instability, and user-visible slowness under activity. |
| P1 | Socket fan-out | Socket relay emits globally instead of by room for messages and conversation changes. | `bot/src/socket-server.ts` uses `io.emit('message:new', ...)` and `io.emit('conversation:updated', ...)`. | Every connected client processes events that may not concern them. |
| P2 | API contract consistency | API contracts are more uniform on the critical web routes touched in this branch, but the rest of the stack is still unconsolidated. | `/api/bots`, `/api/telegram/send`, and `/api/health` now share a response envelope. | Future routes can drift again if the contract is not adopted repo-wide. |
| P2 | Type/schema drift | Critical schema drift was reduced, but full parity still depends on manual maintenance. | `schema.sql`, `types.ts`, and `scripts/check-schema-drift.mjs` now cover critical tables and columns. | Long-term drift risk remains until generation or stronger automation exists. |
| P1 | Bot runtime drift | Bot defaults differ between initial load and hot-added or updated bots. | `bot/src/bot-manager.ts` uses `gpt-4o-mini/8` in `loadBots()` and `gpt-4o/15` in `addBot()` and update fallback. | Runtime behavior can diverge from database expectations and from restart behavior. |
| P1 | Auth/session complexity | Auth recovery still depends on manual localStorage/cookie cleanup and multi-step fallback. | `src/app/(dashboard)/layout.tsx`, `src/hooks/use-session-recovery.ts`, `src/lib/supabase/client.ts`. | Safer than before, but still brittle during token edge cases and reload loops. |
| P2 | Platform split | Web and bot runtime are deployed through separate operational surfaces without a shared diagnostics contract. | Netlify config in `netlify.toml`, socket URL via `NEXT_PUBLIC_SOCKET_URL`, bot `/health` only in `bot/src/index.ts`. | Harder to answer "what is down" during incidents. |
| P2 | Dependency drift | Root and bot use different `@supabase/supabase-js` versions. | Root `package.json` uses `^2.98.0`; `bot/package.json` uses `^2.49.0`. | Different auth/realtime/client behavior across runtimes. |
| P2 | Rate limit design | Rate limit falls back to in-memory memory store when Upstash is absent. | `src/lib/rate-limit.ts`. | Works in single instance dev, but is not reliable across scaled or stateless runtime. |
| P2 | Health coverage | Diagnostics exist now, but they are still basic and not tied to alerting or structured telemetry. | `src/app/api/health/route.ts`, `bot/src/index.ts`. | Better manual triage, but still limited for production monitoring. |
| P3 | Repo hygiene | Workspace shows local node_modules noise and stray local files. | `git status --short` shows untracked `bot/node_modules/*` and local `AGENTS.md`. | Not a runtime issue, but it increases review and tooling noise. |

## Detailed Assessment by Domain

## 1. Auth and Session

Current state:

- session bootstrap in `src/app/(dashboard)/layout.tsx` now uses `getSession()` and falls back to `getUser()`
- visibility-based recovery is centralized in `src/hooks/use-session-recovery.ts`
- broken auth state may still trigger manual localStorage and cookie cleanup plus redirect logic

Health assessment:

- better than before the freeze fix
- still too much bespoke logic around expired sessions and client recovery
- auth correctness depends on coordination between middleware, browser client state, and layout bootstrap

Primary risk:

- future changes can easily reintroduce race conditions because the auth lifecycle is not formalized as a contract

## 2. Realtime, Polling, and Socket Ownership

Current state:

- message and conversation refresh still rely on polling in `src/hooks/use-realtime.ts`
- Supabase Realtime is active for conversation and message updates
- Socket.IO exists as a second live-update system through `src/hooks/use-socket.ts`, `src/hooks/use-socket-conversations.ts`, and `bot/src/socket-server.ts`
- session recovery invalidates all queries after long hidden periods

Health assessment:

- this is the highest-complexity area in the codebase
- each mechanism makes sense in isolation, but the total system is hard to reason about
- the current design is resilient through fallback, but costly in complexity and event duplication

Primary risk:

- non-deterministic UI behavior under reconnects, background restore, or high message volume

## 3. Queries, Mutations, and UX Consistency

Current state:

- critical chat fetches and message sends now have timeouts
- optimistic chat updates exist in `src/hooks/use-messages.ts`
- many mutations still invalidate broad query keys instead of updating focused cache slices

Health assessment:

- critical hang behavior improved
- cache strategy is still more invalidation-driven than state-driven
- this makes correctness dependent on network freshness instead of predictable local state transitions

Primary risk:

- unnecessary re-fetching, stale flashes, and performance degradation as volume grows

## 4. APIs and Error Contracts

Current state:

- web API surface is small: `/api/bots`, `/api/telegram/send`, and `/api/health`
- auth and role checks exist
- input validation is now stronger on the critical write routes
- response envelopes are more consistent on the first-party web routes touched in this branch

Health assessment:

- improving
- still not broad enough across the whole system for long-term maintainability or reliable diagnostics

Primary risk:

- callers must handle endpoint-specific edge cases and error semantics

## 5. Supabase, RLS, and Data Contracts

Current state:

- `supabase/schema.sql` enables RLS on core tables and defines broad policies
- realtime publication exists for `messages` and `conversations`
- manual `src/lib/supabase/types.ts` is significantly larger than the checked schema baseline

Health assessment:

- the DB foundation is better than average for a small app
- the main risk is drift, not lack of security primitives

Primary risk:

- schema, migrations, and manual types stop representing the same system

## 6. Bot, AI, and Operational Consistency

Current state:

- dynamic bot manager supports polling, webhooks, and hot add/remove/update
- bot runtime also owns socket server, cron jobs, casino API calls, and AI behavior
- config updates do not have a formal runtime reconciliation model

Health assessment:

- high capability, but a lot of responsibility sits in one process
- this is powerful for speed, but risky for consistency and incident isolation

Primary risk:

- updates appear applied in DB and partial runtime state, but not in fully restarted behavior

## 7. Observability, Deploy, and Secrets

Current state:

- bot has `/health` and `/diagnostics`
- web now has `/api/health`
- web has no health or diagnostics endpoint
- no central logging or alert destination found
- local `.env` files are ignored by git, which is good, but parity and rotation are not documented in repo

Health assessment:

- operational maturity is currently the weakest part of the stack

Primary risk:

- production failures will be discovered by users before tooling

## Recommendation Summary

Stability-first order:

1. Simplify live-update ownership.
2. Standardize API request and error contracts.
3. Add diagnostics and observability before major feature work.
4. Remove type/schema drift and runtime default drift.
5. Add smoke coverage and CI gates for auth, chats, tags, and bot admin flows.

## Exit Criteria for the Next Audit

- one clear owner per live-update path
- one shared API error shape across web endpoints
- zero known schema/type drift between checked schema and maintained critical types
- one diagnostics contract for web and bot
- smoke tests covering login, reload, background/resume, chat send, label save, and transaction save
- CI that runs lint, typecheck, schema drift checks, and smoke tests on every change

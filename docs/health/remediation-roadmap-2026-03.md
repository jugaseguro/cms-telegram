# Remediation Roadmap

Audit date: 2026-03-24

## Delivery Model

Suggested owners:

- Frontend: panel runtime, auth bootstrap, React Query, chat UX
- Backend/Bot: Socket.IO, Telegram delivery, bot manager, cron jobs, API contracts
- Platform/DB: Supabase schema, RLS, migrations, env parity, diagnostics, CI

Execution principle:

- stabilize first
- simplify second
- add observability before adding more fallback behavior

## Phase 0 - Immediate Stabilization

Target window: 3 to 5 days

Owner split:

- Frontend + Backend/Bot

Scope:

- decide one primary live-update owner for each path:
  - message list
  - conversation list
  - unread badges
  - typing
- stop duplicate refresh behavior where cache update and broad invalidation both happen for the same event
- add a web diagnostics route that reports auth client mode, feature flags relevant to live updates, and runtime health summary without leaking secrets
- add structured server-side logging wrappers for bot runtime and web API routes

Success criteria:

- no duplicate refresh or reconnect behavior during background/resume test loops
- both runtimes expose a diagnostics contract
- all critical chat send/save flows return either success or explicit typed failure

Validation:

- manual smoke: login, F5, resume from hidden tab, send message, save label, register transaction
- log review: each user action should have one dominant live-update path, not several unrelated refreshes

## Phase 1 - Contract Hardening

Target window: 1 week

Owner split:

- Backend/Bot + Platform/DB

Scope:

- add shared input and output validation for `/api/bots` and `/api/telegram/send`
- standardize response envelope for success and error:
  - `ok`
  - `data`
  - `error.code`
  - `error.message`
  - `meta`
- define a documented health/diagnostics contract for:
  - web
  - bot
  - external dependencies summary
- define a documented event contract for:
  - `message:new`
  - `conversation:updated`
  - presence and typing events

Success criteria:

- all first-party web endpoints follow one response shape
- socket event payloads are versioned or documented in one place
- diagnostics can answer whether failures are auth, DB, Telegram, bot, or socket related

Validation:

- endpoint contract snapshots
- local curl or Postman verification for success and failure cases

## Phase 2 - Realtime Simplification

Target window: 1 to 2 weeks

Owner split:

- Frontend + Backend/Bot

Scope:

- choose a durable strategy:
  - Supabase Realtime as source of truth, Socket.IO only for typing/presence
  - or Socket.IO as source of truth, Supabase Realtime reduced to server relay only
- remove global fan-out for message and conversation events where room or subscription scoping is possible
- replace broad `invalidateQueries` patterns with targeted cache updates for critical chat flows
- document fallback rules:
  - when polling is active
  - when recovery runs
  - what happens when socket or realtime is down

Success criteria:

- a message insert produces one cache path update for the active chat
- a conversation update refreshes only affected views
- reconnect behavior is deterministic and documented

Validation:

- prolonged chat session test with active messages
- hidden tab restore test
- offline/online reconnect test

## Phase 3 - Schema and Runtime Consistency

Target window: 1 week

Owner split:

- Platform/DB + Backend/Bot

Scope:

- reconcile `supabase/schema.sql`, migration files, and `src/lib/supabase/types.ts`
- remove or reintroduce missing schema entities such as `ai_usage_logs` so the checked artifacts match reality
- align bot default configuration across initial load, hot add, and hot update
- define a restart policy for config changes:
  - live patch
  - soft restart
  - hard restart

Success criteria:

- no known mismatch between schema file and TypeScript DB types
- bot config defaults are identical across boot path and hot-update path
- every bot config field has a declared runtime application strategy

Validation:

- schema/type diff check
- bot CRUD and config update test matrix

## Phase 4 - Observability and Operations

Target window: 1 week

Owner split:

- Platform/DB

Scope:

- add structured logging fields:
  - request id
  - user id or agent id
  - conversation id
  - bot id
  - operation name
  - error code
- add central error capture for web API routes and bot runtime
- define uptime, health, and alert thresholds for:
  - Telegram delivery failure rate
  - socket connect error rate
  - auth recovery rate
  - query timeout rate
- document env parity and secret rotation checklist for Netlify, bot host, Supabase, Upstash, and OpenAI

Success criteria:

- incident triage can identify failing subsystem in less than 10 minutes
- production issues leave searchable, structured evidence

Validation:

- forced-failure drills for Telegram send, auth expiry, and socket auth errors

## Phase 5 - Testing and CI Foundation

Target window: 1 to 2 weeks

Owner split:

- Frontend + Backend/Bot + Platform/DB

Scope:

- add smoke coverage for:
  - login and reload
  - expired session redirect
  - hidden tab resume
  - send message and attachment
  - save/remove conversation label
  - save/remove customer label
  - register transaction
  - bot CRUD
- add CI checks:
  - lint
  - typecheck
  - smoke tests
  - schema/type drift check

Success criteria:

- changes to chat, auth, or bot flows cannot merge without automated validation

Validation:

- CI must fail on contract drift or broken smoke path

## Backlog After Stabilization

- break shared responsibilities inside the bot process if operational load grows
- move toward generated DB types or an enforced schema export pipeline
- review whether in-memory rate limiting remains acceptable for all deploy modes
- add performance tracing around conversation list and message list refresh pressure

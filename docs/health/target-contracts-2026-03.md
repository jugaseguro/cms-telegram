# Target Contracts

Audit date: 2026-03-24

## Goal

Create one shared language for APIs, health checks, and realtime ownership so future fixes do not add more ambiguity.

## 1. API Response Contract

Recommended envelope for first-party web endpoints:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "string",
    "timestamp": "ISO-8601"
  }
}
```

Error form:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "requestId": "string",
    "timestamp": "ISO-8601"
  }
}
```

Minimum error codes to standardize:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `DEPENDENCY_FAILURE`
- `TIMEOUT`
- `NOT_FOUND`
- `INTERNAL_ERROR`

Apply first to:

- `/api/bots`
- `/api/telegram/send`

## 2. Diagnostics Contract

Recommended endpoints:

- web: `/api/health`
- bot: `/health` plus `/diagnostics` if private diagnostics are needed

Public health payload:

```json
{
  "ok": true,
  "service": "web|bot",
  "version": "git sha or app version",
  "time": "ISO-8601",
  "checks": {
    "process": "up",
    "dependencies": "degraded|up|down"
  }
}
```

Private diagnostics payload should add:

- socket enabled status
- chat mode or feature flags relevant to live updates
- dependency probes summary
- recent timeout and retry counters when available

Do not expose:

- secrets
- raw tokens
- PII
- full env dumps

## 3. Realtime Ownership Contract

Each user-visible event should have one primary owner.

Recommended target:

| Behavior | Primary owner | Secondary fallback |
| --- | --- | --- |
| Active chat message list | one live channel only | polling on degradation |
| Conversation list freshness | one event path only | scheduled refresh if stale |
| Unread badges | same owner as conversation/message event source | none |
| Typing | Socket.IO room events | none |
| Presence | Socket.IO | none |
| Session recovery after hidden tab | session recovery hook | manual reload by user |

Rule:

- do not combine targeted cache update and broad invalidation for the same event unless the reason is explicitly documented

## 4. Bot Configuration Contract

Every bot config field should declare how it applies:

| Field | Apply mode |
| --- | --- |
| `name` | live in memory |
| `color` | live in memory |
| `telegram_username` | live in memory |
| `welcome_message` | live patch if supported |
| `ai_enabled` | declared policy: live patch or restart |
| `ai_system_prompt` | declared policy: live patch or restart |
| `ai_model` | declared policy: live patch or restart |
| `ai_max_history` | declared policy: live patch or restart |
| `token_encrypted` | restart required |
| webhook mode settings | restart or rebind required |

Rule:

- initial boot defaults, hot-add defaults, and update fallback defaults must be identical

## 5. Schema and Type Ownership Contract

Recommended target:

- checked schema file is the source of truth
- migrations update schema export as part of workflow
- TypeScript DB types are generated or verified against that checked schema

Drift rule:

- no table, column, enum, or relation may exist in `src/lib/supabase/types.ts` without matching checked schema evidence

## 6. Test Gate Contract

Minimum automated gate for merge:

- lint
- typecheck
- smoke tests for auth, reload, chat send, labels, transactions, and bot admin
- schema/type drift check

Release gate:

- if auth, chat runtime, or bot runtime changes, smoke coverage must pass before merge

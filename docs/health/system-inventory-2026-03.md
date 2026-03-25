# System Inventory

Audit date: 2026-03-24

## End-to-End Architecture

Primary data flow:

1. Customer sends a Telegram message.
2. Bot receives update through polling or webhook.
3. Bot persists conversation or message state in Supabase.
4. Panel reads data from Supabase through browser client hooks.
5. Panel receives live updates through Supabase Realtime or Socket.IO depending on feature path.
6. Agent actions write back to Supabase and may trigger Telegram delivery through `/api/telegram/send`.

External dependencies in active flow:

- Supabase Auth, DB, Realtime, Storage
- Telegram Bot API
- external socket host via `NEXT_PUBLIC_SOCKET_URL`
- Upstash Redis when configured
- OpenAI and casino APIs inside bot runtime

## First-Party API Inventory

### Web API routes

| Route | Method(s) | Auth | Side effects | Notes |
| --- | --- | --- | --- | --- |
| `/api/bots` | `GET POST PATCH DELETE` | Supabase user, admin for write | reads and mutates `bots` table | now validated with `zod` and shared response envelope |
| `/api/telegram/send` | `POST` | optional user, rate limit by current user or `anonymous` | sends Telegram message, reads `bots`, uses env fallback | now validated with `zod` and shared response envelope |
| `/api/health` | `GET` | none | none | web diagnostics baseline |

### Bot HTTP surface

| Route | Method(s) | Auth | Side effects | Notes |
| --- | --- | --- | --- | --- |
| `/health` | `GET` | none | none | bot health summary |
| `/diagnostics` | `GET` | none | none | bot runtime summary including socket diagnostics |
| `/webhook/:botId` | `POST` | implicit through bot id and Telegram caller path | processes bot updates | only active in webhook mode |

### External API calls

| Caller | External target | Purpose |
| --- | --- | --- |
| `src/app/api/telegram/send/route.ts` | Telegram Bot API | outbound agent messages |
| `bot/src/api/casino.ts` | casino APIs | login, balance, deposit, withdrawal, provider lookup |
| `bot/src/ai/openai.ts` | OpenAI | AI responses and tool-driven behavior |

## Realtime and Runtime Inventory

## Web panel live-update ownership

| Mechanism | File(s) | Current role | Risk |
| --- | --- | --- | --- |
| Session recovery | `src/hooks/use-session-recovery.ts` | visibility-based client reset and query invalidation | can still amplify refresh pressure if other paths keep broad invalidation |
| Supabase Realtime messages | `src/hooks/use-realtime.ts` | active chat updates plus polling fallback | duplicates concern with socket path if both are conceptually enabled over time |
| Supabase Realtime conversations | `src/hooks/use-realtime.ts` | conversation refresh, unread behavior, polling fallback | broad ownership of conversation freshness |
| Socket connection | `src/hooks/use-socket.ts`, `src/lib/socket.ts` | v2 live channel with reconnect and auth refresh | additional lifecycle to reason about |
| Socket conversations | `src/hooks/use-socket-conversations.ts` | unread badges, notifications, conversation invalidation | global event handling instead of room-scoped filtering |
| Typing | `src/hooks/use-typing.ts` | room-based typing indicators | comparatively isolated and healthy |
| Query provider | `src/app/providers.tsx` | global React Query defaults and query error toast | no mutation-level policy standardization yet |

## Timers and listeners observed in project code

High-interest listeners and timers:

- `src/hooks/use-session-recovery.ts`: `visibilitychange`
- `src/hooks/use-tab-title.ts`: `visibilitychange`, interval
- `src/hooks/use-realtime.ts`: polling intervals, stuck-channel timeout, debounce timeout
- `src/hooks/use-socket-conversations.ts`: debounce timeout
- `src/app/(dashboard)/layout.tsx`: auth timeout, signout hard redirect timeout
- `src/components/chats/message-input.tsx`: rate-limit reset timeout
- `src/components/chats/waiting-badge.tsx`: interval
- `src/lib/notification-sound.ts`: click, keydown, touchstart unlock listeners

Interpretation:

- the project is not leaking timers everywhere, but many of the important ones are attached to auth and live-update behavior
- this is why chat stability work has an outsized effect on perceived quality

## State and Cache Inventory

Main client state stores:

- `src/stores/auth-store.ts`
- `src/stores/chat-store.ts`
- `src/stores/realtime-store.ts`
- `src/stores/feature-flags.ts`
- `src/stores/bot-store.ts`

Main server-state hooks:

- conversations, messages, labels, customer labels, bots, presence, segmentation, typing

Observed cache pattern:

- most admin and CRUD flows still rely on invalidation rather than targeted reconciliation
- chat messages combine optimistic insert plus settle invalidation

## Schema, Types, and Migration Inventory

Checked database artifacts:

- `supabase/schema.sql`
- `supabase/migration-ai-casino.sql`
- `supabase/migration-multi-bot.sql`
- `supabase/migration-performance.sql`
- `supabase/migration-segmentation.sql`

Observed drift signals:

- schema and types are manually maintained, not generated
- this branch adds critical alignment for `ai_usage_logs`, bot AI config, and conversation AI state
- this branch also adds `scripts/check-schema-drift.mjs` for critical tables and columns

RLS posture:

- RLS enabled on core domain tables
- policies exist for bots, profiles, customers, conversations, messages, transactions, labels, segmentation, and recontact features

Realtime publication:

- `messages`
- `conversations`

## Dependency and Version Inventory

Key runtime split:

| Package | Web root | Bot |
| --- | --- | --- |
| `@supabase/supabase-js` | `^2.98.0` | `^2.49.0` |
| `socket.io` | client only | `^4.8.3` server |
| TypeScript | `^5` | `^5.7.0` |

Implication:

- shared vendor behavior cannot be assumed to match between runtimes

## Deploy and Environment Inventory

Observed deploy surface:

- web build through `netlify.toml`
- bot server with HTTP, webhook, cron jobs, and Socket.IO in `bot/src/index.ts`
- public socket endpoint configured through `NEXT_PUBLIC_SOCKET_URL`

Important env groups:

- web: Supabase URL, anon key, Telegram bot token, socket URL, Upstash vars
- bot: bot token, Supabase service role, mode, webhook URL, port, encryption key

Operational note:

- `.env*` is ignored by git, which is correct
- no checked documentation was found for env parity across web, bot host, and Supabase project

## Testing and Quality Inventory

What was found:

- Playwright smoke tests under `tests/smoke/`
- CI workflow under `.github/workflows/ci.yml`
- schema drift check under `scripts/check-schema-drift.mjs`
- lint and typecheck scripts for web and bot

What this means:

- the project now has a baseline prevention layer
- it still depends on manual validation for deeper chat, admin, and incident scenarios

## Repo Hygiene Notes

Observed local noise at audit time:

- untracked content under `bot/node_modules/`
- local `AGENTS.md`

Interpretation:

- not a product defect
- worth keeping out of future commits and reviews to reduce noise

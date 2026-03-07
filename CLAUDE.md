# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CRM for managing Telegram customer conversations, transactions, and agent workflows. Two separate apps in one repo:

1. **Next.js web panel** (root `/`) — dashboard for agents/admins to manage chats, customers, and transactions
2. **Telegram bot** (`bot/`) — grammY-based bot that receives customer messages and stores them in Supabase

## Commands

### Web panel (root directory)
- `npm run dev` — start Next.js dev server
- `npm run build` — production build
- `npm run lint` — ESLint

### Telegram bot (`bot/` directory)
- `cd bot && npm run dev` — start bot with tsx watch (polling mode)
- `cd bot && npm run build` — compile TypeScript
- `cd bot && npm start` — run compiled bot

## Architecture

### Two-app communication pattern
The Telegram bot writes incoming messages to Supabase. The web panel reads them via Supabase client queries and receives real-time updates via Supabase Realtime (`postgres_changes`). Outbound messages from agents go through `POST /api/telegram/send`, which calls the Telegram Bot API directly.

### Tech stack
- **Next.js 16** with App Router, React 19, TypeScript, Tailwind CSS v4
- **Supabase** for auth, database (Postgres), and realtime subscriptions
- **grammY** for the Telegram bot
- **shadcn/ui** components (in `src/components/ui/`)
- **Zustand** for client state (`src/stores/`)
- **TanStack Query** for server state (`src/hooks/`)
- **Zod v4** + react-hook-form for form validation
- Deployed to **Netlify** (web panel) and optionally **Railway** (bot in webhook mode)

### Route groups
- `(auth)/` — login page, public
- `(dashboard)/` — authenticated area with sidebar layout. Contains: dashboard, chats, customers, transactions, admin/agents
- `api/telegram/send` — API route to send messages via Telegram Bot API

### Supabase setup
- Schema in `supabase/schema.sql` — tables: profiles, customers, conversations, messages, transactions
- Types in `src/lib/supabase/types.ts` — manually maintained `Database` type + convenience aliases
- Three Supabase client factories: `client.ts` (browser), `server.ts` (RSC/server actions), `middleware.ts` (session refresh)
- RLS enabled on all tables. Roles: `admin` (sees everything) and `agent` (sees own/unassigned)
- Realtime enabled on `messages` and `conversations` tables

### Auth flow
- Supabase Auth with middleware-based session refresh (`src/middleware.ts` → `src/lib/supabase/middleware.ts`)
- Public paths: `/login`, `/auth/callback`, `/landing`, `/api/telegram`
- On signup, a trigger auto-creates a profile row in `profiles`
- Auth state loaded in dashboard layout and stored in `useAuthStore`

### Data hooks pattern
Custom hooks in `src/hooks/` wrap TanStack Query calls to Supabase. Realtime hooks (`use-realtime.ts`) subscribe to `postgres_changes` and invalidate query caches on updates.

## Environment Variables

**Web panel:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TELEGRAM_BOT_TOKEN` (server-side only, for `/api/telegram/send`)

**Bot (`bot/.env`):**
- `BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MODE` — `polling` (dev) or `webhook` (prod)
- `WEBHOOK_URL` — required when MODE=webhook
- `PORT` — defaults to 3001

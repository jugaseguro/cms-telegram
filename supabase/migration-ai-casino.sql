-- Migration: AI + Casino API integration
-- Run this in Supabase SQL Editor

-- ============================================
-- BOTS: AI configuration columns
-- ============================================

alter table public.bots add column if not exists ai_enabled boolean not null default false;
alter table public.bots add column if not exists ai_system_prompt text;
alter table public.bots add column if not exists ai_model text not null default 'gpt-4o';
alter table public.bots add column if not exists ai_max_history integer not null default 15;
alter table public.bots add column if not exists casino_operator text;

-- ============================================
-- CUSTOMERS: Casino session columns
-- ============================================

alter table public.customers add column if not exists casino_token text;
alter table public.customers add column if not exists casino_user_id text;
alter table public.customers add column if not exists casino_username text;
alter table public.customers add column if not exists casino_profile jsonb;

-- ============================================
-- CONVERSATIONS: Pending action state
-- Used to track multi-step AI flows that require
-- a follow-up message (e.g. deposit awaiting photo)
-- Example: {"type": "awaiting_deposit_receipt", "amount": 500, "first_name": "Juan", ...}
-- ============================================

alter table public.conversations add column if not exists pending_action jsonb;

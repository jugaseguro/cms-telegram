-- Migration: Add multi-bot support
-- Run this AFTER creating the bots table but BEFORE enforcing NOT NULL constraints
-- This migrates existing data to the new schema

-- Step 1: Create bots table (if not exists via schema.sql)
-- If running standalone, uncomment:
-- create table if not exists public.bots (
--   id uuid primary key default uuid_generate_v4(),
--   name text not null,
--   telegram_username text,
--   token_encrypted text not null,
--   is_active boolean not null default true,
--   color text not null default '#3b82f6',
--   created_at timestamptz not null default now()
-- );

-- Step 2: Insert the existing bot (replace token with your actual TELEGRAM_BOT_TOKEN)
-- You MUST replace 'YOUR_BOT_TOKEN_HERE' with the real token before running
insert into public.bots (id, name, token_encrypted, color)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Bot Principal',
  'YOUR_BOT_TOKEN_HERE',
  '#3b82f6'
);

-- Step 3: Add bot_id columns as nullable first
alter table public.customers add column if not exists bot_id uuid references public.bots(id) on delete cascade;
alter table public.conversations add column if not exists bot_id uuid references public.bots(id) on delete cascade;
alter table public.transactions add column if not exists bot_id uuid references public.bots(id) on delete cascade;
alter table public.auto_responses add column if not exists bot_id uuid references public.bots(id) on delete cascade;
alter table public.recontact_rules add column if not exists bot_id uuid references public.bots(id) on delete cascade;
alter table public.recontact_logs add column if not exists bot_id uuid references public.bots(id) on delete cascade;

-- Step 4: Set all existing rows to the default bot
update public.customers set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;
update public.conversations set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;
update public.transactions set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;
update public.auto_responses set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;
update public.recontact_rules set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;
update public.recontact_logs set bot_id = 'a0000000-0000-0000-0000-000000000001' where bot_id is null;

-- Step 5: Make bot_id NOT NULL on required tables
alter table public.customers alter column bot_id set not null;
alter table public.conversations alter column bot_id set not null;
alter table public.transactions alter column bot_id set not null;
alter table public.recontact_logs alter column bot_id set not null;

-- Step 6: Update unique constraints on customers
alter table public.customers drop constraint if exists customers_telegram_id_key;
alter table public.customers add constraint customers_telegram_id_bot_id_key unique(telegram_id, bot_id);

-- Step 7: Update shortcut unique index on auto_responses
drop index if exists idx_auto_responses_shortcut;
create unique index idx_auto_responses_shortcut on public.auto_responses(bot_id, shortcut) where shortcut is not null;

-- Step 8: Add new indexes
create index if not exists idx_customers_telegram_bot on public.customers(telegram_id, bot_id);
create index if not exists idx_conversations_bot_id on public.conversations(bot_id);
create index if not exists idx_transactions_bot_id on public.transactions(bot_id);

-- Step 9: Enable RLS on bots
alter table public.bots enable row level security;

create policy "Authenticated can view bots"
  on public.bots for select to authenticated using (true);
create policy "Admins can insert bots"
  on public.bots for insert to authenticated with check (public.get_user_role() = 'admin');
create policy "Admins can update bots"
  on public.bots for update to authenticated using (public.get_user_role() = 'admin');
create policy "Admins can delete bots"
  on public.bots for delete to authenticated using (public.get_user_role() = 'admin');

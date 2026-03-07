-- CRM Telegram - Database Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Profiles: Panel users (agents & admins)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Customers: Telegram clients
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  telegram_id bigint not null unique,
  telegram_username text,
  first_name text,
  last_name text,
  phone text,
  status text not null default 'new' check (status in ('new', 'active', 'inactive')),
  has_paid boolean not null default false,
  uuid_landing text,
  last_activity timestamptz,
  created_at timestamptz not null default now()
);

-- Conversations
create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'pending')),
  last_message_at timestamptz default now(),
  waiting_since timestamptz,
  first_response_at timestamptz,
  created_at timestamptz not null default now()
);

-- Messages
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'agent', 'bot')),
  sender_id text,
  content text,
  message_type text not null default 'text' check (message_type in ('text', 'image', 'document', 'receipt')),
  media_url text,
  telegram_message_id bigint,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

-- Transactions: Balance loads
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  amount decimal(12,2) not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  receipt_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- Auto-responses: Bot auto-reply rules
create table public.auto_responses (
  id uuid primary key default uuid_generate_v4(),
  trigger_text text not null,
  response_text text not null,
  shortcut text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Labels: Visual tags for conversations
create table public.labels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text not null default '#6b7280',
  created_at timestamptz not null default now()
);

-- Conversation-Label junction table
create table public.conversation_labels (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (conversation_id, label_id)
);

-- Recontact rules: Auto-message inactive customers
create table public.recontact_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  condition_type text not null check (condition_type in ('inactive_days', 'no_payment', 'vip_inactive')),
  condition_days integer not null default 7,
  message_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Recontact logs: Track sent recontact messages
create table public.recontact_logs (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.recontact_rules(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_customers_telegram_id on public.customers(telegram_id);
create index idx_conversations_customer_id on public.conversations(customer_id);
create index idx_conversations_agent_id on public.conversations(assigned_agent_id);
create index idx_conversations_status on public.conversations(status);
create index idx_conversations_last_message on public.conversations(last_message_at desc);
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_messages_created_at on public.messages(created_at);
create index idx_transactions_customer_id on public.transactions(customer_id);
create index idx_transactions_status on public.transactions(status);
create unique index idx_auto_responses_shortcut on public.auto_responses(shortcut) where shortcut is not null;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.transactions enable row level security;
alter table public.auto_responses enable row level security;
alter table public.labels enable row level security;
alter table public.conversation_labels enable row level security;
alter table public.recontact_rules enable row level security;
alter table public.recontact_logs enable row level security;

-- Helper function: get user role
create or replace function public.get_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES policies
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Admins can insert profiles"
  on public.profiles for insert
  to authenticated
  with check (public.get_user_role() = 'admin');

create policy "Admins can update profiles"
  on public.profiles for update
  to authenticated
  using (public.get_user_role() = 'admin');

-- CUSTOMERS policies
create policy "Authenticated users can view customers"
  on public.customers for select
  to authenticated
  using (true);

create policy "Authenticated users can insert customers"
  on public.customers for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update customers"
  on public.customers for update
  to authenticated
  using (true);

-- CONVERSATIONS policies
create policy "Agents see assigned and unassigned, admins see all"
  on public.conversations for select
  to authenticated
  using (
    public.get_user_role() = 'admin'
    or assigned_agent_id = auth.uid()
    or assigned_agent_id is null
  );

create policy "Authenticated users can insert conversations"
  on public.conversations for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update conversations"
  on public.conversations for update
  to authenticated
  using (
    public.get_user_role() = 'admin'
    or assigned_agent_id = auth.uid()
    or assigned_agent_id is null
  );

-- MESSAGES policies
create policy "Users can view messages of accessible conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (
        public.get_user_role() = 'admin'
        or c.assigned_agent_id = auth.uid()
        or c.assigned_agent_id is null
      )
    )
  );

create policy "Authenticated users can insert messages"
  on public.messages for insert
  to authenticated
  with check (true);

-- TRANSACTIONS policies
create policy "Agents see own transactions, admins see all"
  on public.transactions for select
  to authenticated
  using (
    public.get_user_role() = 'admin'
    or agent_id = auth.uid()
  );

create policy "Authenticated users can insert transactions"
  on public.transactions for insert
  to authenticated
  with check (true);

create policy "Admins can update transactions"
  on public.transactions for update
  to authenticated
  using (public.get_user_role() = 'admin' or agent_id = auth.uid());

-- AUTO_RESPONSES policies
create policy "Authenticated users can view auto_responses"
  on public.auto_responses for select
  to authenticated
  using (true);

create policy "Admins can insert auto_responses"
  on public.auto_responses for insert
  to authenticated
  with check (public.get_user_role() = 'admin');

create policy "Admins can update auto_responses"
  on public.auto_responses for update
  to authenticated
  using (public.get_user_role() = 'admin');

create policy "Admins can delete auto_responses"
  on public.auto_responses for delete
  to authenticated
  using (public.get_user_role() = 'admin');

-- LABELS policies
create policy "Authenticated can view labels"
  on public.labels for select to authenticated using (true);
create policy "Admins can manage labels"
  on public.labels for all to authenticated using (public.get_user_role() = 'admin');

-- CONVERSATION_LABELS policies
create policy "Authenticated can view conversation_labels"
  on public.conversation_labels for select to authenticated using (true);
create policy "Authenticated can manage conversation_labels"
  on public.conversation_labels for all to authenticated using (true);

-- RECONTACT_RULES policies
create policy "Authenticated can view recontact_rules"
  on public.recontact_rules for select to authenticated using (true);
create policy "Admins can manage recontact_rules"
  on public.recontact_rules for all to authenticated using (public.get_user_role() = 'admin');

-- RECONTACT_LOGS policies
create policy "Authenticated can view recontact_logs"
  on public.recontact_logs for select to authenticated using (true);
create policy "Authenticated can insert recontact_logs"
  on public.recontact_logs for insert to authenticated with check (true);

-- ============================================
-- REALTIME
-- ============================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'agent')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Update conversation last_message_at on new message
create or replace function public.update_conversation_last_message()
returns trigger as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_new_message
  after insert on public.messages
  for each row execute function public.update_conversation_last_message();

-- Track response times on new messages
create or replace function public.update_response_tracking()
returns trigger as $$
begin
  if new.sender_type = 'customer' then
    update public.conversations
    set waiting_since = coalesce(waiting_since, new.created_at)
    where id = new.conversation_id;
  elsif new.sender_type = 'agent' and not coalesce(new.is_internal, false) then
    update public.conversations
    set waiting_since = null,
        first_response_at = coalesce(first_response_at, new.created_at)
    where id = new.conversation_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_message_response_tracking
  after insert on public.messages
  for each row execute function public.update_response_tracking();

-- CRM Telegram - Database Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Bots: Telegram bot configurations
create table public.bots (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  telegram_username text,
  token_encrypted text not null,
  is_active boolean not null default true,
  color text not null default '#3b82f6',
  welcome_message text,
  ai_enabled boolean not null default false,
  ai_system_prompt text,
  ai_model text not null default 'gpt-4o-mini',
  ai_max_history integer not null default 8,
  casino_operator text,
  created_at timestamptz not null default now()
);

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
  telegram_id bigint not null,
  telegram_username text,
  first_name text,
  last_name text,
  phone text,
  status text not null default 'new' check (status in ('new', 'active', 'inactive')),
  has_paid boolean not null default false,
  uuid_landing text,
  last_activity timestamptz,
  casino_token text,
  casino_user_id text,
  casino_username text,
  casino_profile jsonb,
  bot_id uuid not null references public.bots(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(telegram_id, bot_id)
);

-- Conversations
create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  assigned_agent_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'pending', 'waiting_agent')),
  last_message_at timestamptz default now(),
  waiting_since timestamptz,
  first_response_at timestamptz,
  ai_paused boolean not null default false,
  pending_action jsonb,
  bot_id uuid not null references public.bots(id) on delete cascade,
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
  bot_id uuid not null references public.bots(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Auto-responses: Bot auto-reply rules
create table public.auto_responses (
  id uuid primary key default uuid_generate_v4(),
  trigger_text text not null,
  response_text text not null,
  shortcut text,
  is_active boolean not null default true,
  bot_id uuid references public.bots(id) on delete cascade,
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

-- Segmentation rules: Auto-assign labels to customers based on conditions
create table public.segmentation_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  label_id uuid not null references public.labels(id) on delete cascade,
  conditions jsonb not null default '[]',
  is_active boolean not null default true,
  auto_remove boolean not null default false,
  bot_id uuid references public.bots(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Customer-Label junction table
create table public.customer_labels (
  customer_id uuid not null references public.customers(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  assigned_by text not null default 'manual' check (assigned_by in ('manual', 'auto')),
  rule_id uuid references public.segmentation_rules(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (customer_id, label_id)
);

-- Segmentation logs: Audit trail
create table public.segmentation_logs (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.segmentation_rules(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  action text not null check (action in ('assigned', 'removed')),
  created_at timestamptz not null default now()
);

-- Recontact rules: Auto-message inactive customers
create table public.recontact_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  condition_type text not null check (condition_type in ('inactive_days', 'no_payment', 'vip_inactive', 'by_label')),
  condition_days integer not null default 7,
  condition_unit text not null default 'days' check (condition_unit in ('hours', 'days')),
  message_template text not null,
  is_active boolean not null default true,
  bot_id uuid references public.bots(id) on delete cascade,
  target_label_id uuid references public.labels(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Recontact logs: Track sent recontact messages
create table public.recontact_logs (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.recontact_rules(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- Mass Message Campaigns: Track bulk message sends with stats
create table public.mass_message_campaigns (
  id uuid primary key default uuid_generate_v4(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  sent_by uuid not null references public.profiles(id) on delete set null,
  message_text text,
  message_type text not null default 'text',
  media_url text,
  total_targeted int not null default 0,
  total_sent int not null default 0,
  total_delivered int not null default 0,
  total_replied int not null default 0,
  created_at timestamptz not null default now()
);

-- Mass Message Recipients: Per-customer delivery tracking
create table public.mass_message_recipients (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.mass_message_campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  telegram_message_id bigint,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

-- AI usage logs
create table public.ai_usage_logs (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete set null,
  bot_id uuid references public.bots(id) on delete set null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_customers_telegram_id on public.customers(telegram_id);
create index idx_customers_telegram_bot on public.customers(telegram_id, bot_id);
create index idx_conversations_customer_id on public.conversations(customer_id);
create index idx_conversations_agent_id on public.conversations(assigned_agent_id);
create index idx_conversations_status on public.conversations(status);
create index idx_conversations_last_message on public.conversations(last_message_at desc);
create index idx_conversations_bot_id on public.conversations(bot_id);
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_messages_created_at on public.messages(created_at);
create index idx_messages_conversation_date on public.messages(conversation_id, created_at desc);
create index idx_transactions_customer_id on public.transactions(customer_id);
create index idx_transactions_status on public.transactions(status);
create index idx_transactions_bot_id on public.transactions(bot_id);
create unique index idx_auto_responses_shortcut on public.auto_responses(bot_id, shortcut) where shortcut is not null;
create index idx_customer_labels_customer on public.customer_labels(customer_id);
create index idx_customer_labels_label on public.customer_labels(label_id);
create index idx_segmentation_rules_active on public.segmentation_rules(is_active) where is_active = true;
create index idx_segmentation_logs_rule on public.segmentation_logs(rule_id);
create index idx_segmentation_logs_customer on public.segmentation_logs(customer_id);
create unique index idx_messages_unique_telegram_msg on public.messages(conversation_id, telegram_message_id) where telegram_message_id is not null;
create index idx_ai_usage_logs_created_at on public.ai_usage_logs(created_at desc);
create index idx_ai_usage_logs_bot_id on public.ai_usage_logs(bot_id);
create index idx_mass_campaigns_bot on public.mass_message_campaigns(bot_id);
create index idx_mass_campaigns_created on public.mass_message_campaigns(created_at desc);
create index idx_mass_recipients_campaign on public.mass_message_recipients(campaign_id);
create index idx_mass_recipients_conversation on public.mass_message_recipients(conversation_id);
create index idx_mass_recipients_unreplied on public.mass_message_recipients(conversation_id)
  where replied_at is null;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.bots enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.transactions enable row level security;
alter table public.auto_responses enable row level security;
alter table public.labels enable row level security;
alter table public.conversation_labels enable row level security;
alter table public.segmentation_rules enable row level security;
alter table public.customer_labels enable row level security;
alter table public.segmentation_logs enable row level security;
alter table public.recontact_rules enable row level security;
alter table public.recontact_logs enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.mass_message_campaigns enable row level security;
alter table public.mass_message_recipients enable row level security;

-- Helper function: get user role (reads from JWT, falls back to DB query)
create or replace function public.get_user_role()
returns text as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'user_role'),
    (select role from public.profiles where id = auth.uid())
  );
$$ language sql security definer stable
set search_path = '';

-- Sync role changes to JWT app_metadata
create or replace function public.sync_role_to_jwt()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('user_role', new.role)
    where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer
set search_path = '';

create trigger on_profile_role_change
  after update of role on public.profiles
  for each row execute function public.sync_role_to_jwt();

-- BOTS policies (authenticated can view public fields, admins manage)
create policy "Authenticated can view bots"
  on public.bots for select
  to authenticated
  using (true);

create policy "Admins can insert bots"
  on public.bots for insert
  to authenticated
  with check (public.get_user_role() = 'admin');

create policy "Admins can update bots"
  on public.bots for update
  to authenticated
  using (public.get_user_role() = 'admin');

create policy "Admins can delete bots"
  on public.bots for delete
  to authenticated
  using (public.get_user_role() = 'admin');

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

-- SEGMENTATION_RULES policies
create policy "Authenticated can view segmentation_rules"
  on public.segmentation_rules for select to authenticated using (true);
create policy "Admins can manage segmentation_rules"
  on public.segmentation_rules for all to authenticated using (public.get_user_role() = 'admin');

-- CUSTOMER_LABELS policies
create policy "Authenticated can view customer_labels"
  on public.customer_labels for select to authenticated using (true);
create policy "Authenticated can manage customer_labels"
  on public.customer_labels for all to authenticated using (true);

-- SEGMENTATION_LOGS policies
create policy "Authenticated can view segmentation_logs"
  on public.segmentation_logs for select to authenticated using (true);
create policy "Authenticated can insert segmentation_logs"
  on public.segmentation_logs for insert to authenticated with check (true);

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
create policy "Authenticated can view ai_usage_logs"
  on public.ai_usage_logs for select to authenticated using (true);

-- MASS_MESSAGE_CAMPAIGNS policies
create policy "Authenticated can view mass_message_campaigns"
  on public.mass_message_campaigns for select to authenticated using (true);
create policy "Authenticated can insert mass_message_campaigns"
  on public.mass_message_campaigns for insert to authenticated with check (true);
create policy "Authenticated can update mass_message_campaigns"
  on public.mass_message_campaigns for update to authenticated using (true);

-- MASS_MESSAGE_RECIPIENTS policies
create policy "Authenticated can view mass_message_recipients"
  on public.mass_message_recipients for select to authenticated using (true);
create policy "Authenticated can insert mass_message_recipients"
  on public.mass_message_recipients for insert to authenticated with check (true);
create policy "Authenticated can update mass_message_recipients"
  on public.mass_message_recipients for update to authenticated using (true);

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
$$ language plpgsql security definer
set search_path = '';

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
$$ language plpgsql security definer
set search_path = '';

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
$$ language plpgsql security definer
set search_path = '';

create trigger on_message_response_tracking
  after insert on public.messages
  for each row execute function public.update_response_tracking();

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Evaluate a segmentation rule and return matching customer IDs
create or replace function public.evaluate_segmentation_rule(p_rule_id uuid)
returns table(customer_id uuid) as $$
declare
  v_rule record;
  v_condition jsonb;
  v_query text;
  v_field text;
  v_operator text;
  v_value text;
  v_sql_op text;
  v_sql_expr text;
begin
  select * into v_rule from public.segmentation_rules where id = p_rule_id;

  if v_rule is null then
    return;
  end if;

  v_query := '
    SELECT c.id as customer_id
    FROM public.customers c
    LEFT JOIN LATERAL (
      SELECT
        count(*) as tx_count,
        coalesce(sum(amount), 0) as tx_total,
        coalesce(avg(amount), 0) as tx_avg,
        min(created_at) as first_tx
      FROM public.transactions t
      WHERE t.customer_id = c.id AND t.status = ''confirmed''
    ) tx ON true
    WHERE 1=1';

  if v_rule.bot_id is not null then
    v_query := v_query || ' AND c.bot_id = ' || quote_literal(v_rule.bot_id);
  end if;

  for v_condition in select * from jsonb_array_elements(v_rule.conditions)
  loop
    v_field := v_condition->>'field';
    v_operator := v_condition->>'operator';
    v_value := v_condition->>'value';

    case v_operator
      when 'eq' then v_sql_op := '=';
      when 'neq' then v_sql_op := '!=';
      when 'gt' then v_sql_op := '>';
      when 'gte' then v_sql_op := '>=';
      when 'lt' then v_sql_op := '<';
      when 'lte' then v_sql_op := '<=';
      else continue;
    end case;

    case v_field
      when 'transaction_count' then
        v_sql_expr := 'tx.tx_count';
      when 'total_amount' then
        v_sql_expr := 'tx.tx_total';
      when 'avg_amount' then
        v_sql_expr := 'tx.tx_avg';
      when 'inactive_days' then
        v_sql_expr := 'extract(epoch from (now() - c.last_activity)) / 86400';
      when 'has_paid' then
        v_sql_expr := 'c.has_paid';
        v_value := case when v_value = 'true' then 'true' else 'false' end;
        v_query := v_query || ' AND ' || v_sql_expr || ' ' || v_sql_op || ' ' || v_value;
        continue;
      when 'status' then
        v_sql_expr := 'c.status';
        v_query := v_query || ' AND ' || v_sql_expr || ' ' || v_sql_op || ' ' || quote_literal(v_value);
        continue;
      when 'days_since_first_tx' then
        v_sql_expr := 'extract(epoch from (now() - tx.first_tx)) / 86400';
      else
        continue;
    end case;

    v_query := v_query || ' AND ' || v_sql_expr || ' ' || v_sql_op || ' ' || v_value;
  end loop;

  return query execute v_query;
end;
$$ language plpgsql security definer
set search_path = '';

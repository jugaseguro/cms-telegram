-- Migration: Customer Segmentation System
-- Adds segmentation_rules, customer_labels, segmentation_logs tables
-- Adds target_label_id + by_label condition to recontact_rules

-- ============================================
-- NEW TABLES (correct order for FK references)
-- ============================================

-- Segmentation rules: auto-assign labels based on conditions
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

-- Customer-Label junction table (reuses existing labels)
create table public.customer_labels (
  customer_id uuid not null references public.customers(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  assigned_by text not null default 'manual' check (assigned_by in ('manual', 'auto')),
  rule_id uuid references public.segmentation_rules(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (customer_id, label_id)
);

-- Segmentation logs: audit trail
create table public.segmentation_logs (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.segmentation_rules(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  action text not null check (action in ('assigned', 'removed')),
  created_at timestamptz not null default now()
);

-- ============================================
-- INDEXES
-- ============================================

create index idx_customer_labels_customer on public.customer_labels(customer_id);
create index idx_customer_labels_label on public.customer_labels(label_id);
create index idx_segmentation_rules_active on public.segmentation_rules(is_active) where is_active = true;
create index idx_segmentation_logs_rule on public.segmentation_logs(rule_id);
create index idx_segmentation_logs_customer on public.segmentation_logs(customer_id);

-- ============================================
-- RLS
-- ============================================

alter table public.customer_labels enable row level security;
alter table public.segmentation_rules enable row level security;
alter table public.segmentation_logs enable row level security;

-- customer_labels: all authenticated can view and manage
create policy "Authenticated can view customer_labels"
  on public.customer_labels for select to authenticated using (true);
create policy "Authenticated can manage customer_labels"
  on public.customer_labels for all to authenticated using (true);

-- segmentation_rules: all can view, admin can manage
create policy "Authenticated can view segmentation_rules"
  on public.segmentation_rules for select to authenticated using (true);
create policy "Admins can manage segmentation_rules"
  on public.segmentation_rules for all to authenticated using (public.get_user_role() = 'admin');

-- segmentation_logs: all can view, all can insert (bot uses service role anyway)
create policy "Authenticated can view segmentation_logs"
  on public.segmentation_logs for select to authenticated using (true);
create policy "Authenticated can insert segmentation_logs"
  on public.segmentation_logs for insert to authenticated with check (true);

-- ============================================
-- RECONTACT: Add label-based targeting
-- ============================================

alter table public.recontact_rules
  add column if not exists target_label_id uuid references public.labels(id) on delete set null;

-- Drop old check constraint and add new one with 'by_label'
alter table public.recontact_rules
  drop constraint if exists recontact_rules_condition_type_check;
alter table public.recontact_rules
  add constraint recontact_rules_condition_type_check
  check (condition_type in ('inactive_days', 'no_payment', 'vip_inactive', 'by_label'));

-- ============================================
-- RPC: Evaluate segmentation rule
-- ============================================

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

  -- Filter by bot if rule is bot-specific
  if v_rule.bot_id is not null then
    v_query := v_query || ' AND c.bot_id = ' || quote_literal(v_rule.bot_id);
  end if;

  -- Apply each condition (AND logic)
  for v_condition in select * from jsonb_array_elements(v_rule.conditions)
  loop
    v_field := v_condition->>'field';
    v_operator := v_condition->>'operator';
    v_value := v_condition->>'value';

    -- Map operator
    case v_operator
      when 'eq' then v_sql_op := '=';
      when 'neq' then v_sql_op := '!=';
      when 'gt' then v_sql_op := '>';
      when 'gte' then v_sql_op := '>=';
      when 'lt' then v_sql_op := '<';
      when 'lte' then v_sql_op := '<=';
      else continue;
    end case;

    -- Map field to SQL expression
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

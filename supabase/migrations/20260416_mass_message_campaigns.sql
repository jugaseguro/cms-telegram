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

-- Indexes
create index idx_mass_campaigns_bot on public.mass_message_campaigns(bot_id);
create index idx_mass_campaigns_created on public.mass_message_campaigns(created_at desc);
create index idx_mass_recipients_campaign on public.mass_message_recipients(campaign_id);
create index idx_mass_recipients_conversation on public.mass_message_recipients(conversation_id);
create index idx_mass_recipients_unreplied on public.mass_message_recipients(conversation_id)
  where replied_at is null;

-- RLS
alter table public.mass_message_campaigns enable row level security;
alter table public.mass_message_recipients enable row level security;

create policy "Authenticated can view mass_message_campaigns"
  on public.mass_message_campaigns for select to authenticated using (true);
create policy "Authenticated can insert mass_message_campaigns"
  on public.mass_message_campaigns for insert to authenticated with check (true);
create policy "Authenticated can update mass_message_campaigns"
  on public.mass_message_campaigns for update to authenticated using (true);

create policy "Authenticated can view mass_message_recipients"
  on public.mass_message_recipients for select to authenticated using (true);
create policy "Authenticated can insert mass_message_recipients"
  on public.mass_message_recipients for insert to authenticated with check (true);
create policy "Authenticated can update mass_message_recipients"
  on public.mass_message_recipients for update to authenticated using (true);

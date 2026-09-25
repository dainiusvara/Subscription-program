-- Live bank connections (open banking through Enable Banking). The server
-- talks to the bank provider; the app can only read a connection's status.
-- Transactions are never stored: each sync reads them, finds subscriptions
-- and keeps only what it found.

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 1 and 200),
  bank_country text not null check (bank_country ~ '^[A-Z]{2}$'),
  -- pending: waiting for the user to log in at the bank. active: syncing.
  -- expired: the bank's consent ended or was withdrawn; the user reconnects.
  status text not null default 'pending' check (status in ('pending', 'active', 'expired')),
  -- One-time value that ties the bank's redirect back to this connection. Server only.
  auth_state text unique,
  -- The provider's session and the accounts it covers. Server only.
  session_id text unique,
  account_ids text[] not null default '{}',
  -- When the bank's consent ends (usually 180 days).
  valid_until timestamptz,
  last_synced_at timestamptz,
  -- A short, user-facing reason when the last sync failed.
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_connections_user_id_idx on public.bank_connections (user_id);

create trigger bank_connections_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

alter table public.bank_connections enable row level security;

create policy "Users see their own bank connections" on public.bank_connections
  for select to authenticated using (user_id = (select auth.uid()));

-- Read-only for the app, and never the provider session or the state.
revoke all on public.bank_connections from anon, authenticated;
grant select (id, bank_name, bank_country, status, valid_until, last_synced_at, last_error, created_at)
  on public.bank_connections to authenticated;

-- What the bank sync already handled, so a subscription the user deleted is
-- never added again. One row per merchant the sync recognised.
create table public.bank_detections (
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_key text not null check (char_length(merchant_key) between 1 and 200),
  -- added: the sync created the subscription. matched: the user already had it.
  outcome text not null check (outcome in ('added', 'matched')),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

create index bank_detections_subscription_id_idx on public.bank_detections (subscription_id);

alter table public.bank_detections enable row level security;

create policy "Users see what their bank sync found" on public.bank_detections
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.bank_detections from anon, authenticated;
grant select (merchant_key, outcome, subscription_id, created_at) on public.bank_detections to authenticated;

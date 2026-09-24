-- Step 4: payments with Stripe. The Stripe webhook is the only thing that
-- changes a user's plan; the app can read these fields but never write them.

alter table public.profiles
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text,
  -- Stripe's subscription status: active, trialing, past_due, canceled, ...
  add column pro_status text,
  -- End of the paid period. After a cancellation, Pro lasts until this date.
  add column pro_until timestamptz,
  -- Time of the last Stripe event applied, so late or repeated events can't undo newer ones.
  add column stripe_event_at timestamptz;

-- One row of settings for the whole app, server only.
create table public.app_config (
  id boolean primary key default true check (id),
  -- Set by the Stripe webhook the first time it receives an event. From then
  -- on the free Pro preview no longer counts.
  payments_live boolean not null default false
);

insert into public.app_config default values;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create function public.payments_live() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select payments_live from public.app_config where id), false);
$$;

create or replace function public.enforce_free_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_pro boolean;
  owned integer;
begin
  if exists (select 1 from public.subscriptions s where s.id = new.id) then
    return new;
  end if;

  select p.is_pro or (p.pro_preview and not public.payments_live()) into has_pro
    from public.profiles p where p.id = new.user_id;
  if coalesce(has_pro, false) then
    return new;
  end if;

  select count(*) into owned from public.subscriptions s where s.user_id = new.user_id;
  if owned >= 5 then
    raise exception 'The Free plan covers 5 subscriptions' using errcode = 'P0001', hint = 'free_limit';
  end if;
  return new;
end;
$$;

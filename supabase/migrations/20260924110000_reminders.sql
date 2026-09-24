-- Step 3: reminders by email and web push, 3 days before each charge.

alter table public.profiles
  -- IANA time zone (e.g. Europe/Vilnius), so "in 3 days" means the user's days.
  add column timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  add column remind_email boolean not null default true;

grant update (currency, timezone, remind_email) on public.profiles to authenticated;

-- One row per device that allowed notifications ------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users see their own devices" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users remove their own devices" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Registers this device for the signed-in user. A browser endpoint belongs to
-- one user at a time: if someone else signed in on this device before, it moves.
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;

revoke execute on function public.register_push(text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;

-- What was already sent, so a reminder goes out once per charge and channel --

create table public.reminder_log (
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  charge_date date not null,
  channel text not null check (channel in ('email', 'push')),
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, charge_date, channel)
);

-- Server only: no policies, so the app can't read or write it.
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

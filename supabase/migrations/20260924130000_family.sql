-- Step 7: family sharing. A family (household) shares some subscriptions and
-- splits their cost. Everything goes through the functions below, which check
-- the rules; the app can only read these tables directly.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Family' check (char_length(btrim(name)) between 1 and 40),
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  -- One family per person.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- A subscription is shared with the family when it points at the household.
alter table public.subscriptions
  add column household_id uuid references public.households (id) on delete set null;

create index subscriptions_household_id_idx on public.subscriptions (household_id) where household_id is not null;

-- The signed-in user's family, for use in policies (avoids policies that query themselves).
create function public.my_household_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "Members see their family" on public.households
  for select to authenticated using (id = public.my_household_id());

create policy "Members see each other" on public.household_members
  for select to authenticated using (household_id = public.my_household_id());

revoke all on public.households, public.household_members from anon, authenticated;
grant select on public.households, public.household_members to authenticated;

-- Family members can read shared subscriptions; you can only share into your own family.
create policy "Family members see shared subscriptions" on public.subscriptions
  for select to authenticated
  using (household_id is not null and household_id = public.my_household_id());

drop policy "Users manage their own subscriptions" on public.subscriptions;
create policy "Users manage their own subscriptions" on public.subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (household_id is null or household_id = public.my_household_id())
  );

-- Functions ---------------------------------------------------------------------

-- 10 random hex characters (from gen_random_uuid, which uses a secure random source).
create function public.new_invite_code() returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create function public.create_household(p_name text) returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  has_pro boolean;
  household public.households;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = me) then
    raise exception 'You are already in a family' using errcode = 'P0001', hint = 'already_member';
  end if;
  select p.is_pro or (p.pro_preview and not public.payments_live()) into has_pro from public.profiles p where p.id = me;
  if not coalesce(has_pro, false) then
    raise exception 'Family sharing is part of Pro' using errcode = 'P0001', hint = 'pro_required';
  end if;

  insert into public.households (name, owner_id, invite_code)
    values (coalesce(nullif(btrim(p_name), ''), 'Family'), me, public.new_invite_code())
    returning * into household;
  insert into public.household_members (household_id, user_id, email)
    select household.id, me, coalesce(u.email, '') from auth.users u where u.id = me;
  return household;
end;
$$;

create function public.join_household(p_code text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select id into target from public.households where invite_code = upper(btrim(p_code));
  if target is null then
    raise exception 'No family has that code' using errcode = 'P0001', hint = 'bad_code';
  end if;
  if exists (select 1 from public.household_members where user_id = me) then
    raise exception 'You are already in a family' using errcode = 'P0001', hint = 'already_member';
  end if;
  if (select count(*) from public.household_members where household_id = target) >= 6 then
    raise exception 'This family is full' using errcode = 'P0001', hint = 'family_full';
  end if;
  insert into public.household_members (household_id, user_id, email)
    select target, me, coalesce(u.email, '') from auth.users u where u.id = me;
  return target;
end;
$$;

-- Leaving stops sharing your subscriptions. When the owner leaves, the family ends.
create function public.leave_household() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  family uuid := public.my_household_id();
begin
  if family is null then
    return;
  end if;
  if exists (select 1 from public.households where id = family and owner_id = me) then
    delete from public.households where id = family;
  else
    update public.subscriptions set household_id = null where user_id = me and household_id = family;
    delete from public.household_members where user_id = me;
  end if;
end;
$$;

create function public.remove_household_member(p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  family uuid := public.my_household_id();
begin
  if not exists (select 1 from public.households where id = family and owner_id = me) then
    raise exception 'Only the family owner can remove people' using errcode = '42501';
  end if;
  if p_user = me then
    raise exception 'Use leave_household to end the family' using errcode = 'P0001';
  end if;
  update public.subscriptions set household_id = null where user_id = p_user and household_id = family;
  delete from public.household_members where household_id = family and user_id = p_user;
end;
$$;

create function public.renew_invite_code() returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text := public.new_invite_code();
begin
  update public.households set invite_code = code where id = public.my_household_id() and owner_id = auth.uid();
  if not found then
    raise exception 'Only the family owner can change the code' using errcode = '42501';
  end if;
  return code;
end;
$$;

revoke execute on function public.create_household(text), public.join_household(text), public.leave_household(),
  public.remove_household_member(uuid), public.renew_invite_code(), public.new_invite_code()
  from public, anon;
grant execute on function public.create_household(text), public.join_household(text), public.leave_household(),
  public.remove_household_member(uuid), public.renew_invite_code()
  to authenticated;

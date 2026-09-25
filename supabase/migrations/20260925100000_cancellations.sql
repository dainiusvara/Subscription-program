-- Cancelled subscriptions stay in the list so Drip can show what cancelling
-- saved. They no longer charge, get reminders or count towards the Free limit.

alter table public.subscriptions
  add column cancelled_on date check (cancelled_on between '2000-01-01' and '2100-12-31');

-- Only subscriptions still being paid for count towards the Free plan's 5.
create or replace function public.enforce_free_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_pro boolean;
  active integer;
begin
  if new.cancelled_on is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- An upsert of an existing row is an edit, not a new subscription.
    if exists (select 1 from public.subscriptions s where s.id = new.id) then
      return new;
    end if;
  elsif old.cancelled_on is null then
    -- An edit of a subscription that was already being paid for.
    return new;
  end if;

  select p.is_pro or (p.pro_preview and not public.payments_live()) into has_pro
    from public.profiles p where p.id = new.user_id;
  if coalesce(has_pro, false) then
    return new;
  end if;

  select count(*) into active from public.subscriptions s
    where s.user_id = new.user_id and s.cancelled_on is null and s.id <> new.id;
  if active >= 5 then
    raise exception 'The Free plan covers 5 subscriptions' using errcode = 'P0001', hint = 'free_limit';
  end if;
  return new;
end;
$$;

-- Restoring a cancelled subscription counts as adding one.
create trigger subscriptions_free_limit_restore before update of cancelled_on on public.subscriptions
  for each row execute function public.enforce_free_limit();

-- A cancelled subscription isn't shared: the family stops splitting it.
alter table public.subscriptions
  add constraint subscriptions_cancelled_not_shared check (cancelled_on is null or household_id is null);

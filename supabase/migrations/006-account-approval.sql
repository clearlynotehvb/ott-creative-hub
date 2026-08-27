-- ============================================================================
-- New accounts start as `pending` and see nothing until an Owner approves
-- them. Existing accounts are grandfathered in as approved.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Status enum + column -----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

-- Guarded on the column not existing, so re-running never sends live accounts
-- back to pending.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'status'
  ) then
    alter table public.profiles
      add column status public.account_status not null default 'pending';

    -- Everyone who already had an account keeps their access.
    update public.profiles set status = 'approved';
  end if;
end $$;

create index if not exists profiles_status_idx on public.profiles (status);

-- 2. New signups are pending --------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  is_first boolean;
begin
  -- Bootstrap: the very first account is approved automatically, otherwise
  -- there would be nobody able to approve anyone.
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, first_name, last_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
      'media_buyer'::public.user_role
    ),
    case when is_first then 'approved' else 'pending' end::public.account_status
  )
  on conflict (id) do nothing;

  return new;
end;
$fn$;

-- 3. Approval gate ------------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select status = 'approved' from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- Writing requires approval too, so a pending account can't post anything.
create or replace function public.can_manage_creatives()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select status = 'approved'
         and role::text = any (array['owner', 'creative_lead'])
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$fn$;

create or replace function public.can_upload_creatives()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select status = 'approved'
         and role::text = any (
           array['owner', 'creative_lead', 'graphic_designer', 'media_buyer']
         )
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$fn$;

-- 4. Reads require approval ---------------------------------------------------
-- A pending user must still be able to read their OWN profile row, otherwise
-- the app can't tell them why they're locked out.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approved());

drop policy if exists "products readable by authenticated" on public.products;
create policy "products readable by authenticated"
  on public.products for select to authenticated using (public.is_approved());

drop policy if exists "creatives readable by authenticated" on public.creatives;
create policy "creatives readable by authenticated"
  on public.creatives for select to authenticated using (public.is_approved());

drop policy if exists "assets readable by authenticated" on public.creative_assets;
create policy "assets readable by authenticated"
  on public.creative_assets for select to authenticated using (public.is_approved());

drop policy if exists "copy readable by authenticated" on public.creative_copy;
create policy "copy readable by authenticated"
  on public.creative_copy for select to authenticated using (public.is_approved());

drop policy if exists "groups readable by authenticated" on public.creative_groups;
create policy "groups readable by authenticated"
  on public.creative_groups for select to authenticated using (public.is_approved());

drop policy if exists "creatives bucket read" on storage.objects;
create policy "creatives bucket read"
  on storage.objects for select to authenticated
  using (bucket_id = 'creatives' and public.is_approved());

-- 5. Only an Owner decides ----------------------------------------------------
-- `status` is not in the column grants for `authenticated`, so this function is
-- the only way it can change.
create or replace function public.set_account_status(
  target_user uuid,
  new_status public.account_status
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(
       (select role from public.profiles where id = auth.uid()),
       'media_buyer'::public.user_role
     ) <> 'owner' then
    raise exception 'Only an Owner can approve accounts' using errcode = '42501';
  end if;

  if target_user = auth.uid() then
    raise exception 'You cannot change your own account status'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  update public.profiles set status = new_status where id = target_user;
end;
$fn$;

revoke all on function public.set_account_status(uuid, public.account_status)
  from public;
grant execute on function public.set_account_status(uuid, public.account_status)
  to authenticated;

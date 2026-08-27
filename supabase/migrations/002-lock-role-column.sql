-- ============================================================================
-- Fix: a user could change their own `role` via the "update own profile"
-- policy, so any Media Buyer could promote themselves to Owner.
--
-- RLS policies can't restrict which COLUMNS are writable, so the row policy
-- alone was never enough. Column privileges do that, and role changes move
-- behind a SECURITY DEFINER function that verifies the caller is an Owner.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Users may edit their own name. Nothing else — crucially not `role`.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

-- 2. This policy can no longer do anything useful; role changes go via the
--    function below.
drop policy if exists "owner manages profiles" on public.profiles;

-- 3. The only way to change a role.
create or replace function public.set_user_role(
  target_user uuid,
  new_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  owner_count integer;
  target_role public.user_role;
begin
  if coalesce(
       (select role from public.profiles where id = auth.uid()),
       'media_buyer'::public.user_role
     ) <> 'owner' then
    raise exception 'Only an Owner can change roles'
      using errcode = '42501';
  end if;

  select role into target_role from public.profiles where id = target_user;
  if target_role is null then
    raise exception 'No such user' using errcode = 'P0002';
  end if;

  -- Never let the last Owner be demoted; that would lock everyone out.
  if target_role = 'owner' and new_role <> 'owner' then
    select count(*) into owner_count from public.profiles where role = 'owner';
    if owner_count <= 1 then
      raise exception 'There must be at least one Owner'
        using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = new_role where id = target_user;
end;
$fn$;

revoke all on function public.set_user_role(uuid, public.user_role) from public;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

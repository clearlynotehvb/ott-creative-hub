-- ============================================================================
-- A per-creative on/off switch, so the team can see at a glance which ads are
-- actually running right now.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.creatives
  add column if not exists is_live boolean not null default false;

create index if not exists creatives_is_live_idx on public.creatives (is_live);

-- ---------------------------------------------------------------------------
-- Flipping the switch is not an edit.
-- `updated_at` drives the "Last edited" stamp, which should mean the content
-- changed. So when is_live is the ONLY thing that moved, leave it alone.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  if new.is_live is distinct from old.is_live
     and (to_jsonb(new) - 'is_live' - 'updated_at')
       = (to_jsonb(old) - 'is_live' - 'updated_at') then
    new.updated_at = old.updated_at;
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Anyone approved may flip it — the media buyer running the ad is usually the
-- one who knows, and they can't edit the creative itself. Content edits stay
-- restricted to managers and the creator.
-- ---------------------------------------------------------------------------
create or replace function public.set_creative_live(
  target_creative uuid,
  live boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_approved() then
    raise exception 'Your account is not approved' using errcode = '42501';
  end if;

  if not exists (select 1 from public.creatives where id = target_creative) then
    raise exception 'No such creative' using errcode = 'P0002';
  end if;

  update public.creatives set is_live = live where id = target_creative;
end;
$fn$;

revoke all on function public.set_creative_live(uuid, boolean) from public;
grant execute on function public.set_creative_live(uuid, boolean) to authenticated;

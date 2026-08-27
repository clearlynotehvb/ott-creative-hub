-- ============================================================================
-- Adds:
--   * `angle` on creatives — the messaging angle the ad is testing.
--   * `creative_groups` — a launch batch, so the media buyer can see which ads
--     are meant to go live together.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Ad angle -----------------------------------------------------------------
alter table public.creatives
  add column if not exists angle text;

create index if not exists creatives_angle_idx
  on public.creatives (lower(angle));

-- 2. Launch groups ------------------------------------------------------------
create table if not exists public.creative_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists creative_groups_created_at_idx
  on public.creative_groups (created_at desc);

-- A creative belongs to at most one launch batch. Deleting the group leaves the
-- creatives in place, just ungrouped.
alter table public.creatives
  add column if not exists group_id uuid
  references public.creative_groups (id) on delete set null;

create index if not exists creatives_group_idx on public.creatives (group_id);

-- 3. RLS: everyone reads, only Owners and Creative Leads write ----------------
alter table public.creative_groups enable row level security;

drop policy if exists "groups readable by authenticated" on public.creative_groups;
create policy "groups readable by authenticated"
  on public.creative_groups for select to authenticated using (true);

drop policy if exists "groups write by managers" on public.creative_groups;
create policy "groups write by managers"
  on public.creative_groups for all to authenticated
  using (public.can_manage_creatives())
  with check (public.can_manage_creatives());

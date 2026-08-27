-- ============================================================================
-- Ad angles become editable data instead of a hardcoded list, so the team can
-- manage them from the Supabase table editor without a deploy.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

create table if not exists public.ad_angles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  position   integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists ad_angles_position_idx
  on public.ad_angles (position, name);

-- Seed with the list that used to live in the code.
insert into public.ad_angles (name, position) values
  ('Social proof',          10),
  ('Problem / solution',    20),
  ('Offer / discount',      30),
  ('UGC testimonial',       40),
  ('Founder story',         50),
  ('Product demo',          60),
  ('Before / after',        70),
  ('Objection handling',    80),
  ('Scarcity / urgency',    90),
  ('Lifestyle / aspiration', 100)
on conflict (name) do nothing;

-- Keep any angle already typed on a creative, so nothing disappears.
insert into public.ad_angles (name, position)
select distinct trim(angle), 200
from public.creatives
where angle is not null and trim(angle) <> ''
on conflict (name) do nothing;

-- RLS: everyone approved can read; Owners and Creative Leads can change them.
alter table public.ad_angles enable row level security;

drop policy if exists "angles readable by authenticated" on public.ad_angles;
create policy "angles readable by authenticated"
  on public.ad_angles for select to authenticated
  using (public.is_approved());

drop policy if exists "angles write by managers" on public.ad_angles;
create policy "angles write by managers"
  on public.ad_angles for all to authenticated
  using (public.can_manage_creatives())
  with check (public.can_manage_creatives());

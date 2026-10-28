-- ============================================================================
-- The Creative Hub now also lives inside the OTT Hub (Railway), which signs
-- people in with its own accounts. These columns record which OTT Hub user
-- uploaded a creative, so members can edit and delete their own work.
-- Creatives uploaded from this app keep using created_by as before.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.creatives
  add column if not exists hub_user_id text,
  add column if not exists hub_user_name text;

create index if not exists creatives_hub_user_idx on public.creatives (hub_user_id);

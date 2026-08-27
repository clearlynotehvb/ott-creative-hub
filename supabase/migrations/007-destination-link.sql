-- ============================================================================
-- Each creative carries the link the ad sends people to, so the media buyer
-- can copy it straight into the ad set instead of hunting for it.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

alter table public.creatives
  add column if not exists destination_url text;

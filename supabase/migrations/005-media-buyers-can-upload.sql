-- ============================================================================
-- Media Buyers get the same access as Graphic Designers: they can upload
-- creatives and manage the ones they created.
--
-- Every upload policy routes through can_upload_creatives(), so redefining
-- that one function is the whole change — no policies need touching.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

create or replace function public.can_upload_creatives()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select role::text = any (
        array['owner', 'creative_lead', 'graphic_designer', 'media_buyer']
      )
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$fn$;

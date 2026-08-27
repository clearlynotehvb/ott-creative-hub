-- ============================================================================
-- Adds the Graphic Designer role: can upload creatives and manage the ones
-- they created, but cannot touch other people's work, sync products, or
-- manage the team.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. New role ----------------------------------------------------------------
-- Compared as text below rather than cast to the enum, so this file still runs
-- inside a single transaction (Postgres refuses to USE a new enum value in the
-- same transaction that adds it).
alter type public.user_role add value if not exists 'graphic_designer';

-- 2. Who may create creatives -------------------------------------------------
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
        array['owner', 'creative_lead', 'graphic_designer']
      )
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$fn$;

-- Did the current user create this creative?
create or replace function public.owns_creative(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.creatives
    where id = target and created_by = auth.uid()
  );
$fn$;

-- 3. creatives ---------------------------------------------------------------
drop policy if exists "creatives insert by managers" on public.creatives;
drop policy if exists "creatives insert by uploaders" on public.creatives;
create policy "creatives insert by uploaders"
  on public.creatives for insert to authenticated
  with check (public.can_upload_creatives());

drop policy if exists "creatives update by managers" on public.creatives;
create policy "creatives update by managers"
  on public.creatives for update to authenticated
  using (public.can_manage_creatives() or created_by = auth.uid())
  with check (public.can_manage_creatives() or created_by = auth.uid());

drop policy if exists "creatives delete by managers" on public.creatives;
create policy "creatives delete by managers"
  on public.creatives for delete to authenticated
  using (public.can_manage_creatives() or created_by = auth.uid());

-- 4. creative_assets ---------------------------------------------------------
drop policy if exists "assets write by managers" on public.creative_assets;

drop policy if exists "assets insert by uploaders" on public.creative_assets;
create policy "assets insert by uploaders"
  on public.creative_assets for insert to authenticated
  with check (public.can_upload_creatives());

drop policy if exists "assets modify by owner or manager" on public.creative_assets;
create policy "assets modify by owner or manager"
  on public.creative_assets for update to authenticated
  using (public.can_manage_creatives() or public.owns_creative(creative_id))
  with check (public.can_manage_creatives() or public.owns_creative(creative_id));

drop policy if exists "assets delete by owner or manager" on public.creative_assets;
create policy "assets delete by owner or manager"
  on public.creative_assets for delete to authenticated
  using (public.can_manage_creatives() or public.owns_creative(creative_id));

-- 5. creative_copy -----------------------------------------------------------
drop policy if exists "copy write by managers" on public.creative_copy;

drop policy if exists "copy insert by uploaders" on public.creative_copy;
create policy "copy insert by uploaders"
  on public.creative_copy for insert to authenticated
  with check (public.can_upload_creatives());

drop policy if exists "copy modify by owner or manager" on public.creative_copy;
create policy "copy modify by owner or manager"
  on public.creative_copy for update to authenticated
  using (public.can_manage_creatives() or public.owns_creative(creative_id))
  with check (public.can_manage_creatives() or public.owns_creative(creative_id));

drop policy if exists "copy delete by owner or manager" on public.creative_copy;
create policy "copy delete by owner or manager"
  on public.creative_copy for delete to authenticated
  using (public.can_manage_creatives() or public.owns_creative(creative_id));

-- 6. creative_groups ---------------------------------------------------------
-- Designers need to create a group from the upload form, but only managers
-- may rename or delete one.
drop policy if exists "groups write by managers" on public.creative_groups;

drop policy if exists "groups insert by uploaders" on public.creative_groups;
create policy "groups insert by uploaders"
  on public.creative_groups for insert to authenticated
  with check (public.can_upload_creatives());

drop policy if exists "groups modify by managers" on public.creative_groups;
create policy "groups modify by managers"
  on public.creative_groups for update to authenticated
  using (public.can_manage_creatives())
  with check (public.can_manage_creatives());

drop policy if exists "groups delete by managers" on public.creative_groups;
create policy "groups delete by managers"
  on public.creative_groups for delete to authenticated
  using (public.can_manage_creatives());

-- 7. Storage -----------------------------------------------------------------
-- Uploaders need insert (new file), update (retrying an upload upserts) and
-- delete (removing a creative takes its files with it).
drop policy if exists "creatives bucket insert" on storage.objects;
create policy "creatives bucket insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and public.can_upload_creatives());

drop policy if exists "creatives bucket update" on storage.objects;
create policy "creatives bucket update"
  on storage.objects for update to authenticated
  using (bucket_id = 'creatives' and public.can_upload_creatives());

drop policy if exists "creatives bucket delete" on storage.objects;
create policy "creatives bucket delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'creatives' and public.can_upload_creatives());

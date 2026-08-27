-- ============================================================================
-- Own The Trend :: Media Buying Dashboard
-- Run this whole file once in the Supabase SQL Editor (Dashboard > SQL Editor).
-- It is idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'owner', 'creative_lead', 'graphic_designer', 'media_buyer'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'asset_ratio') then
    create type public.asset_ratio as enum ('1:1', '4:5', '9:16');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  email       text not null default '',
  role        public.user_role not null default 'media_buyer',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, first_name, last_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
      'media_buyer'::public.user_role
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookup helpers. SECURITY DEFINER so policies on profiles do not recurse.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $fn$
  select role from public.profiles where id = auth.uid();
$fn$;

create or replace function public.can_manage_creatives()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role in ('owner', 'creative_lead') from public.profiles where id = auth.uid()),
    false
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 3. products (mirror of the Shopify catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  shopify_product_id text not null unique,
  title              text not null,
  handle             text,
  status             text,
  image_url          text,
  total_inventory    integer,
  price              numeric(12,2),
  currency           text,
  synced_at          timestamptz not null default now()
);

create index if not exists products_title_idx on public.products (lower(title));

-- ---------------------------------------------------------------------------
-- 4. creatives
-- ---------------------------------------------------------------------------
create table if not exists public.creatives (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  product_id  uuid references public.products (id) on delete set null,
  notes       text,
  -- Where the ad sends people; copied into the ad set by the buyer.
  destination_url text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists creatives_created_at_idx on public.creatives (created_at desc);
create index if not exists creatives_product_idx on public.creatives (product_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists creatives_touch_updated_at on public.creatives;
create trigger creatives_touch_updated_at
  before update on public.creatives
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. creative_assets (one row per ratio slot; image OR video)
-- ---------------------------------------------------------------------------
create table if not exists public.creative_assets (
  id           uuid primary key default gen_random_uuid(),
  creative_id  uuid not null references public.creatives (id) on delete cascade,
  ratio        public.asset_ratio not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  file_size    bigint,
  kind         text not null default 'image' check (kind in ('image', 'video')),
  poster_path  text,
  created_at   timestamptz not null default now(),
  unique (creative_id, ratio)
);

create index if not exists creative_assets_creative_idx on public.creative_assets (creative_id);

-- ---------------------------------------------------------------------------
-- 6. creative_copy (headline + primary text variants)
-- ---------------------------------------------------------------------------
create table if not exists public.creative_copy (
  id           uuid primary key default gen_random_uuid(),
  creative_id  uuid not null references public.creatives (id) on delete cascade,
  headline     text not null default '',
  primary_text text not null default '',
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists creative_copy_creative_idx on public.creative_copy (creative_id, position);

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.products        enable row level security;
alter table public.creatives       enable row level security;
alter table public.creative_assets enable row level security;
alter table public.creative_copy   enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- RLS can't restrict WHICH columns are writable, so the policy above would
-- otherwise let anyone set their own role. Column privileges close that, and
-- role changes go through set_user_role() below.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

-- products (read-only to clients; writes happen server-side w/ service role) --
drop policy if exists "products readable by authenticated" on public.products;
create policy "products readable by authenticated"
  on public.products for select to authenticated using (true);

-- creatives -----------------------------------------------------------------
drop policy if exists "creatives readable by authenticated" on public.creatives;
create policy "creatives readable by authenticated"
  on public.creatives for select to authenticated using (true);

drop policy if exists "creatives insert by managers" on public.creatives;
create policy "creatives insert by managers"
  on public.creatives for insert to authenticated
  with check (public.can_manage_creatives());

drop policy if exists "creatives update by managers" on public.creatives;
create policy "creatives update by managers"
  on public.creatives for update to authenticated
  using (public.can_manage_creatives()) with check (public.can_manage_creatives());

drop policy if exists "creatives delete by managers" on public.creatives;
create policy "creatives delete by managers"
  on public.creatives for delete to authenticated
  using (public.can_manage_creatives());

-- creative_assets -----------------------------------------------------------
drop policy if exists "assets readable by authenticated" on public.creative_assets;
create policy "assets readable by authenticated"
  on public.creative_assets for select to authenticated using (true);

drop policy if exists "assets write by managers" on public.creative_assets;
create policy "assets write by managers"
  on public.creative_assets for all to authenticated
  using (public.can_manage_creatives()) with check (public.can_manage_creatives());

-- creative_copy -------------------------------------------------------------
drop policy if exists "copy readable by authenticated" on public.creative_copy;
create policy "copy readable by authenticated"
  on public.creative_copy for select to authenticated using (true);

drop policy if exists "copy write by managers" on public.creative_copy;
create policy "copy write by managers"
  on public.creative_copy for all to authenticated
  using (public.can_manage_creatives()) with check (public.can_manage_creatives());

-- ---------------------------------------------------------------------------
-- 8. Storage bucket for the original, full-quality files
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('creatives', 'creatives', false, 524288000)  -- 500 MB per file
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "creatives bucket read" on storage.objects;
create policy "creatives bucket read"
  on storage.objects for select to authenticated
  using (bucket_id = 'creatives');

drop policy if exists "creatives bucket insert" on storage.objects;
create policy "creatives bucket insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and public.can_manage_creatives());

drop policy if exists "creatives bucket update" on storage.objects;
create policy "creatives bucket update"
  on storage.objects for update to authenticated
  using (bucket_id = 'creatives' and public.can_manage_creatives());

drop policy if exists "creatives bucket delete" on storage.objects;
create policy "creatives bucket delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'creatives' and public.can_manage_creatives());

-- ---------------------------------------------------------------------------
-- 9. The only way to change a role: Owner-gated, and never removes the last one
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 10. Ad angle + launch groups
-- ---------------------------------------------------------------------------
-- Adds:
--   * `angle` on creatives — the messaging angle the ad is testing.
--   * `creative_groups` — a launch batch, so the media buyer can see which ads
--     are meant to go live together.

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

-- ---------------------------------------------------------------------------
-- 11. Graphic Designer role
-- ---------------------------------------------------------------------------
-- 11.1 New role
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
        array['owner', 'creative_lead', 'graphic_designer', 'media_buyer']
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

-- ---------------------------------------------------------------------------
-- 12. Account approval: new signups wait for an Owner
-- ---------------------------------------------------------------------------
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
-- ---------------------------------------------------------------------------
-- 13. Ad angles (editable list)
-- ---------------------------------------------------------------------------
-- Ad angles become editable data instead of a hardcoded list, so the team can
-- manage them from the Supabase table editor without a deploy.

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

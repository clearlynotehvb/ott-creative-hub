# Own The Trend — Creative Hub

Creative library for the media buying team. Creative Leads and Owners upload ad
creatives (4:5, 1:1, 9:16 — image or video) with their headlines and ad copy;
Media Buyers browse the grid, copy the text, and download the originals in full
quality.

Built with Next.js 16, Supabase (auth + Postgres + Storage) and the Shopify
Admin API. Deploys to Vercel.

---

## What each role can do

| | Media Buyer | Graphic Designer | Creative Lead | Owner |
|---|---|---|---|---|
| Browse the grid, open creatives | ✅ | ✅ | ✅ | ✅ |
| Copy headlines / ad copy | ✅ | ✅ | ✅ | ✅ |
| Download originals | ✅ | ✅ | ✅ | ✅ |
| Upload creatives | ✅ | ✅ | ✅ | ✅ |
| Edit / delete **their own** creatives | ✅ | ✅ | ✅ | ✅ |
| Edit / delete **anyone's** creatives | — | — | ✅ | ✅ |
| Create launch groups | ✅ | ✅ | ✅ | ✅ |
| Rename / delete launch groups | — | — | ✅ | ✅ |
| Sync the Shopify catalog | — | — | ✅ | ✅ |
| Change people's roles | — | — | — | ✅ |

Signup is open: anyone can create an account and pick their own role. An Owner
can correct it afterwards on **Team**. This is enforced in the database with Row
Level Security, not just in the UI — a Media Buyer's upload is rejected by
Postgres even if they call the API directly.

---

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a
   new project. Save the database password somewhere safe.
2. Open **SQL Editor**, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. It creates the
   tables, the roles, the RLS policies, the signup trigger, and the private
   `creatives` storage bucket. It is safe to re-run.
3. Run every file in [`supabase/migrations/`](supabase/migrations) in filename
   order, the same way. `schema.sql` already contains these fixes, so a
   brand-new project can skip this — an existing one cannot.
4. Open **Project Settings → API** and copy the three values into `.env.local`
   (see below).

> If the SQL editor refuses to create the `storage.objects` policies (some
> projects lock that table down), run everything except section 8, then add the
> four policies by hand under **Storage → Policies → creatives**.

### 2. Fill in `.env.local`

Copy the template and fill in the blanks:

```bash
cp .env.local.example .env.local
```

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → service_role key (**server-only, never expose**) |
| `SHOPIFY_STORE_DOMAIN` | already set to `ownthetrendae.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | already set |
| `SHOPIFY_API_VERSION` | already set to `2026-07` |

### 3. Email confirmation

By default Supabase emails a confirmation link before a new account can sign in.
While you're setting the team up it's easier to turn that off:
**Authentication → Sign In / Providers → Email → Confirm email = off**.

Turn it back on before you invite people outside the team.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000, create your own account first and pick **Owner**,
then go to **Products** and hit *Sync from Shopify*.

---

## Upload size limit

**50 MB per file** by default — set by Supabase project-wide, not by this app.
It is enforced in MiB, and Windows labels MiB as "MB", so a video Explorer
calls "50 MB" is usually a few hundred KB over and will be rejected.

To raise it:

1. Supabase Dashboard → **Storage → Settings → Upload file size limit**. 50 MB
   is the Free-plan maximum, so going higher needs Pro.
2. Set `NEXT_PUBLIC_MAX_UPLOAD_MB` in `.env.local` (and in Vercel) to the same
   number, so the form rejects oversized files instantly instead of failing
   after a long upload.

The storage bucket itself already allows 500 MB, so nothing else needs changing.

---

## Deploying

The repo lives at **github.com/clearlynotehvb/ott-creative-hub** and is
connected to the Vercel project `ott-creative-hub`:

- **Push to `main` → production deploys automatically.** No local machine
  needed; edit on GitHub or push from anywhere.
- Any other branch or pull request gets its own preview URL.
- Live at **https://ott-creative-hub.vercel.app**.

Server functions run in **Frankfurt** (`vercel.json` → `fra1`), next to the
Supabase project in Central EU. Every page makes several database calls in a
row, so keeping the two in the same region is what keeps pages fast. If the
database ever moves, move `regions` with it.

### Environment variables

Set in Vercel under **Settings → Environment Variables**, for Production and
Preview. `.env.local` holds the same values for local development and is never
committed.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design; RLS does the protecting |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS; server-only |
| `SHOPIFY_STORE_DOMAIN` | `ownthetrendae.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | **Secret.** Rotating it in Shopify revokes the old one, so update Vercel at the same time |
| `SHOPIFY_API_VERSION` | e.g. `2026-07` |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | Match Supabase's upload size limit |

Changing a variable only takes effect on the next deploy. Redeploy from the
Vercel dashboard, or push any commit.

### Moving to a new Supabase project

1. Create the project in **Central EU (Frankfurt)**.
2. Run `supabase/schema.sql` once in its SQL Editor. It holds every migration,
   so skip the files in `supabase/migrations/`.
3. Turn off **Authentication → Email → Confirm email**.
4. Swap the three `SUPABASE` variables in Vercel and redeploy.
5. Sign up first and pick Owner. On an empty database the first account is
   approved automatically, and everyone after that waits in the Team tab.
6. Open **Products → Sync from Shopify** to reload the catalogue.

---

## How it fits together

**Uploads go straight from the browser to Supabase Storage.** They never pass
through a serverless function, so the 4.5 MB Vercel request-body limit doesn't
apply — video files of any size work. Vercel only ever sees small JSON writes.

**"Download all" is one ZIP, not N downloads.** Browsers block rapid
successive downloads, so firing one per file only ever delivers the first.
`/api/creatives/[id]/download-all` streams a single archive instead, piping
files through from Supabase without buffering and storing rather than deflating
them — already-compressed images and video come out byte-identical.

**Single downloads are redirects, not proxies.** `/api/download/[assetId]` checks that
you're signed in, then hands back a 60-second signed URL with
`Content-Disposition: attachment`. The bytes stream from Supabase directly to
the browser at full original quality — nothing is re-encoded or resized.

**The storage bucket is private.** Every image in the grid is a signed URL,
batch-created server-side in one round trip per page and valid for an hour.

**Video thumbnails are made in the browser.** On upload, a frame is grabbed off
the video onto a canvas and stored as a JPEG poster, so the grid has something
to show without any server-side video processing.

**Shopify is cached, inventory is live.** *Sync from Shopify* pulls the catalog
into the `products` table so the upload picker is instant. Stock numbers on the
creative detail page are fetched live from the Admin API each time it's opened,
so the buyer never sees stale inventory.

---

## Project layout

```
src/
  app/
    (app)/                  signed-in area (auth-guarded by the layout)
      creatives/            grid + detail view
      upload/               upload form (Creative Lead / Owner)
      products/             Shopify catalog + sync
      team/                 role management (Owner)
    api/
      download/[assetId]/   signed download redirect
      products/../inventory live Shopify stock
      shopify/sync/         catalog sync (service role)
    login/ signup/          auth pages
    auth/actions.ts         sign in / sign up / sign out
  components/               UI
  lib/
    supabase/               browser, server and service-role clients
    shopify.ts              Admin GraphQL wrapper
    media.ts                signed URLs, thumbnails, formatting
    poster.ts               client-side video frame capture
  proxy.ts                  session refresh + route guard
supabase/schema.sql         the whole database, idempotent
```

---

## Adding things later

The schema has room to grow without a rewrite:

- **Campaigns / status workflow** — add a `campaigns` table and a
  `status` column on `creatives`; the grid filter bar is already there.
- **More placements** — add a value to the `asset_ratio` enum and an entry to
  `RATIOS` in `src/lib/types.ts`.
- **Performance data** — creatives are keyed by product, so ad-account metrics
  can join straight onto them.

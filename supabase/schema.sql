-- ScrapLoop schema. Paste into Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  title        text not null check (char_length(title) between 3 and 120),
  category     text not null,
  intent       text not null check (intent in ('reuse', 'recycle')),
  quantity     text check (char_length(quantity) <= 60),
  price        numeric check (price is null or price >= 0),
  price_type   text not null check (price_type in ('fixed', 'offer', 'free')),
  city         text not null check (char_length(city) <= 60),
  area         text check (char_length(area) <= 60),
  description  text check (char_length(description) <= 800),
  photo_url    text,
  seller_name  text not null check (char_length(seller_name) <= 60),
  seller_phone text not null check (char_length(seller_phone) <= 20),
  status       text not null default 'available',
  sold_at      timestamptz,
  edit_token   text not null
);

-- Deal outcome, reported by the seller when closing a listing (safe to re-run on an existing table).
alter table public.listings add column if not exists sold_via   text;   -- platform | elsewhere | not_sold
alter table public.listings add column if not exists sold_price numeric;
alter table public.listings add column if not exists sold_ref   text;   -- SL-XXXX code from the buyer's WhatsApp message
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check check (status in ('available', 'sold', 'removed'));
alter table public.listings drop constraint if exists listings_sold_via_check;
alter table public.listings add constraint listings_sold_via_check check (sold_via is null or sold_via in ('platform', 'elsewhere', 'not_sold'));

alter table public.listings enable row level security;

drop policy if exists "listings are public" on public.listings;
create policy "listings are public" on public.listings
  for select to anon, authenticated using (true);

drop policy if exists "anyone can post" on public.listings;
create policy "anyone can post" on public.listings
  for insert to anon, authenticated with check (status = 'available' and sold_at is null);

-- Everyone can read listings, but never the secret edit_token.
revoke all on public.listings from anon, authenticated;
grant select (id, created_at, title, category, intent, quantity, price, price_type, city, area,
              description, photo_url, seller_name, seller_phone, status, sold_at, sold_via)
  on public.listings to anon, authenticated;
grant insert (id, title, category, intent, quantity, price, price_type, city, area,
              description, photo_url, seller_name, seller_phone, status, edit_token)
  on public.listings to anon, authenticated;

-- Sellers close a listing with the token saved in their browser when they posted,
-- and say whether the buyer came from the platform.
drop function if exists public.mark_sold(uuid, text);
create or replace function public.close_listing(p_id uuid, p_token text, p_via text, p_price numeric, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_via not in ('platform', 'elsewhere', 'not_sold') then
    raise exception 'invalid outcome';
  end if;
  update public.listings
     set status     = case when p_via = 'not_sold' then 'removed' else 'sold' end,
         sold_at    = now(),
         sold_via   = p_via,
         sold_price = case when p_via = 'not_sold' then null else p_price end,
         sold_ref   = left(p_ref, 12)
   where id = p_id and edit_token = p_token and status = 'available';
  return found;
end;
$$;

revoke all on function public.close_listing(uuid, text, text, numeric, text) from public;
grant execute on function public.close_listing(uuid, text, text, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Analytics events (page views, listing views, contact clicks, posts, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  visitor_id  text not null,
  session_id  text,
  name        text not null check (char_length(name) <= 40),
  listing_id  uuid,
  props       jsonb not null default '{}'::jsonb
);
create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_name_idx on public.events (name);

alter table public.events enable row level security;

drop policy if exists "anyone can log events" on public.events;
create policy "anyone can log events" on public.events
  for insert to anon, authenticated with check (true);

drop policy if exists "stats page can read events" on public.events;
create policy "stats page can read events" on public.events
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  visitor_id  text,
  role        text,
  src         text,
  message     text not null check (char_length(message) between 1 and 1000)
);

alter table public.feedback enable row level security;

drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated with check (true);

drop policy if exists "stats page can read feedback" on public.feedback;
create policy "stats page can read feedback" on public.feedback
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Photo storage (public bucket, anyone can upload)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "anyone can upload listing photos" on storage.objects;
create policy "anyone can upload listing photos" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'listing-photos');

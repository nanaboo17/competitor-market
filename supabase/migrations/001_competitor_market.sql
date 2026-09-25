-- This migration mirrors the schema already applied to the connected Supabase project.
-- It is included so the GitHub repository has a reproducible schema.

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.competitor_reports (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  competitor_name_detected text,
  sighting_type text not null default 'poster'
    check (sighting_type in ('poster','banner','billboard','booth','flyer','storefront','pole_ad','sales_activation','other')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  gps_accuracy_m double precision check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  photo_path text not null,
  raw_ocr_text text,
  package_name text,
  speed_mbps integer check (speed_mbps is null or speed_mbps >= 0),
  price_amount numeric(14,2) check (price_amount is null or price_amount >= 0),
  currency text not null default 'IDR',
  promo_text text,
  valid_until date,
  installation_fee numeric(14,2) check (installation_fee is null or installation_fee >= 0),
  contract_months integer check (contract_months is null or contract_months >= 0),
  contact_number text,
  notes text,
  ai_status text not null default 'not_run'
    check (ai_status in ('not_run','processing','completed','failed','reviewed')),
  ai_extraction jsonb not null default '{}'::jsonb,
  ai_confidence jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists competitor_reports_agent_created_idx on public.competitor_reports (agent_id, created_at desc);
create index if not exists competitor_reports_competitor_idx on public.competitor_reports (competitor_id);
create index if not exists competitor_reports_geo_idx on public.competitor_reports (latitude, longitude);

alter table public.competitors enable row level security;
alter table public.competitor_reports enable row level security;

grant select on public.competitors to authenticated;
grant select, insert, update, delete on public.competitor_reports to authenticated;

drop policy if exists "competitors_authenticated_read" on public.competitors;
create policy "competitors_authenticated_read" on public.competitors for select to authenticated using (true);
drop policy if exists "competitor_reports_select_own" on public.competitor_reports;
create policy "competitor_reports_select_own" on public.competitor_reports for select to authenticated using ((select auth.uid()) = agent_id);
drop policy if exists "competitor_reports_insert_own" on public.competitor_reports;
create policy "competitor_reports_insert_own" on public.competitor_reports for insert to authenticated with check ((select auth.uid()) = agent_id);
drop policy if exists "competitor_reports_update_own" on public.competitor_reports;
create policy "competitor_reports_update_own" on public.competitor_reports for update to authenticated using ((select auth.uid()) = agent_id) with check ((select auth.uid()) = agent_id);
drop policy if exists "competitor_reports_delete_own" on public.competitor_reports;
create policy "competitor_reports_delete_own" on public.competitor_reports for delete to authenticated using ((select auth.uid()) = agent_id);

insert into public.competitors (name) values
  ('IndiHome'), ('MyRepublic'), ('Biznet'), ('First Media'), ('CBN'), ('ICONNET')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competitor-posters','competitor-posters',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "competitor_posters_select_own" on storage.objects;
create policy "competitor_posters_select_own" on storage.objects for select to authenticated
using (bucket_id='competitor-posters' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "competitor_posters_insert_own" on storage.objects;
create policy "competitor_posters_insert_own" on storage.objects for insert to authenticated
with check (bucket_id='competitor-posters' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "competitor_posters_update_own" on storage.objects;
create policy "competitor_posters_update_own" on storage.objects for update to authenticated
using (bucket_id='competitor-posters' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='competitor-posters' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "competitor_posters_delete_own" on storage.objects;
create policy "competitor_posters_delete_own" on storage.objects for delete to authenticated
using (bucket_id='competitor-posters' and (storage.foldername(name))[1]=(select auth.uid())::text);

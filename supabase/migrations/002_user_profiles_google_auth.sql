create schema if not exists private;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  role text not null default 'agent' check (role in ('agent','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

revoke all on table public.users from anon;
revoke all on table public.users from authenticated;
grant select on table public.users to authenticated;

drop policy if exists users_select_own on public.users;
create policy users_select_own
on public.users
for select
to authenticated
using ((select auth.uid()) = id);

create or replace function private.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    avatar_url,
    provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.raw_app_meta_data ->> 'provider',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_auth_user() from public;
revoke all on function private.sync_auth_user() from anon;
revoke all on function private.sync_auth_user() from authenticated;

drop trigger if exists sync_auth_user_profile on auth.users;
create trigger sync_auth_user_profile
after insert or update of email, raw_user_meta_data, raw_app_meta_data
on auth.users
for each row
execute function private.sync_auth_user();

insert into public.users (
  id,
  email,
  full_name,
  avatar_url,
  provider,
  created_at,
  updated_at
)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture'),
  raw_app_meta_data ->> 'provider',
  coalesce(created_at, now()),
  now()
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  provider = excluded.provider,
  updated_at = now();

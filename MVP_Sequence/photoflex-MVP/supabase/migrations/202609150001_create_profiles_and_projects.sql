create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  document jsonb not null,
  schema_version integer not null check (schema_version > 0),
  cloud_revision bigint not null default 0 check (cloud_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);
create index projects_owner_updated_at_idx on public.projects(owner_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

create policy "profiles_select_own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
for delete to authenticated using ((select auth.uid()) = id);

create policy "projects_select_own" on public.projects
for select to authenticated using ((select auth.uid()) = owner_id);
create policy "projects_insert_own" on public.projects
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "projects_update_own" on public.projects
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy "projects_delete_own" on public.projects
for delete to authenticated using ((select auth.uid()) = owner_id);

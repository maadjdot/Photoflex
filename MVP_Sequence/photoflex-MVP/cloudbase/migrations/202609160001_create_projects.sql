create table public.projects (
  id uuid primary key,
  owner_id text not null,
  name text not null,
  document jsonb not null,
  schema_version integer not null check (schema_version > 0),
  cloud_revision bigint not null default 0 check (cloud_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_at_idx
  on public.projects (owner_id, updated_at desc);

alter table public.projects enable row level security;

revoke all on table public.projects from public, anon, authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant all on table public.projects to service_role;

create policy projects_select_own on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy projects_update_own on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy projects_delete_own on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- KORBAN — server storage, step 1
-- supabase/migrations/0001_init.sql
--
-- Run once in the Supabase dashboard: SQL Editor → new query → paste → Run.
-- Running it twice is harmless. It creates nothing you have to maintain by
-- hand afterwards; later changes come as numbered files beside this one.
--
-- Shape, and why:
--
--   orgs          A company. Every estimator belongs to one, even working
--                 alone, so the day a second seat is added it is an insert
--                 rather than a migration against live jobs.
--   members       Who is in a company, and what they may do.
--   projects      One row per job: a few plain columns for the list, the
--                 whole record as JSON for the job itself. The list can be
--                 read without dragging a megabyte of geometry down with it.
--   settings      One row per company: rates, crew, material, proposal
--                 language, scope keywords.
--
-- Nothing is ever hard deleted. A deleted job is stamped and kept, so one
-- machine deleting a job tells the other machines to drop it too, and so a
-- job deleted in error can come back.

-- ---------------------------------------------------------------------------
-- Companies and who is in them
-- ---------------------------------------------------------------------------
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Company',
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  org_id      uuid not null references public.orgs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- owner: everything, including people. estimator: jobs and settings.
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists members_user_idx on public.members (user_id);

-- ---------------------------------------------------------------------------
-- Jobs
--
-- The key is (org_id, id): project ids are made on the estimator's own
-- machine, so they are only promised to be unique within one company.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  org_id          uuid not null references public.orgs (id) on delete cascade,
  id              text not null,
  -- Who last wrote it. Useful once a company has more than one estimator.
  owner           uuid references auth.users (id) on delete set null,

  -- The list: enough to draw the Bid Room without reading a single job.
  name            text not null default '',
  customer        text not null default '',
  proposal_number text not null default '',
  bid_status      text not null default '',
  bid_round       text not null default '',
  final_bid       numeric not null default 0,
  bid_due_date    text not null default '',

  -- The job itself.
  data            jsonb not null,

  -- The record's own updatedAt, copied out so the newest copy can be told
  -- without reading the whole job.
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  -- Set when deleted. Never unset by the app; a restore clears it.
  deleted_at      timestamptz,

  primary key (org_id, id)
);

create index if not exists projects_org_idx on public.projects (org_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Settings, one row a company
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  org_id      uuid primary key references public.orgs (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The database itself refuses to hand one company another company's jobs -
-- not the app. A stolen publishable key gets nothing without a session, and
-- a signed-in estimator sees only what their membership allows.
-- ---------------------------------------------------------------------------
alter table public.orgs     enable row level security;
alter table public.members  enable row level security;
alter table public.projects enable row level security;
alter table public.settings enable row level security;

-- Am I in this company? Written as a function so the policies stay readable
-- and the membership lookup does not recurse through members' own policy.
create or replace function public.is_member(check_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = check_org and m.user_id = auth.uid()
  );
$$;

drop policy if exists "orgs: mine" on public.orgs;
create policy "orgs: mine" on public.orgs
  for select using (public.is_member(id));

drop policy if exists "members: mine" on public.members;
create policy "members: mine" on public.members
  for select using (user_id = auth.uid() or public.is_member(org_id));

drop policy if exists "projects: my company" on public.projects;
create policy "projects: my company" on public.projects
  for all using (public.is_member(org_id)) with check (public.is_member(org_id));

drop policy if exists "settings: my company" on public.settings;
create policy "settings: my company" on public.settings
  for all using (public.is_member(org_id)) with check (public.is_member(org_id));

-- ---------------------------------------------------------------------------
-- updated_at keeps itself honest, whatever wrote the row
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Every new account gets a company of its own, made the moment it is created.
-- The app never has to create one, so it never has to be trusted to.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
begin
  insert into public.orgs (name) values (coalesce(split_part(new.email, '@', 1), 'My Company') || '''s company')
    returning id into new_org;
  insert into public.members (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The accounts that already exist got no trigger, so give them one each now.
do $$
declare
  u record;
  new_org uuid;
begin
  for u in select id, email from auth.users where id not in (select user_id from public.members) loop
    insert into public.orgs (name) values (coalesce(split_part(u.email, '@', 1), 'My Company') || '''s company')
      returning id into new_org;
    insert into public.members (org_id, user_id, role) values (new_org, u.id, 'owner');
  end loop;
end;
$$;

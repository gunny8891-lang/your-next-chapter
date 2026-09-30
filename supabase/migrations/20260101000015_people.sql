-- Person (project brief section 17): structured records for a member's
-- meaningful relationships — never a full contacts import, just the people
-- worth the app knowing about, so it can suggest natural reconnection
-- ("You haven't seen David recently and you're free Wednesday afternoon").
create table public.people (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  relationship text,
  shared_interests text[] not null default '{}',
  notes text,
  wants_to_see_more boolean not null default false,
  last_seen_date date,
  created_at timestamptz not null default now()
);

create index people_member_id_idx on public.people (member_id);

alter table public.people enable row level security;

create policy "people owner or admin select"
  on public.people for select
  using (member_id = auth.uid() or public.is_admin());

create policy "people owner insert"
  on public.people for insert
  with check (member_id = auth.uid());

create policy "people owner update"
  on public.people for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "people owner delete"
  on public.people for delete
  using (member_id = auth.uid());

-- Explicit grants — a blanket `grant ... on all tables` in an earlier
-- migration only covers tables that existed when it ran, not this one.
grant select, insert, update, delete on public.people to authenticated;
grant all on public.people to service_role;

-- The daily nudge job gets a third trigger condition (reconnecting with
-- someone the member said they'd like to see more of) — extend the existing
-- check constraint to allow it.
alter table public.nudges drop constraint nudges_reason_check;
alter table public.nudges add constraint nudges_reason_check
  check (reason in ('activity_gap', 'weather_match', 'people_reconnect'));

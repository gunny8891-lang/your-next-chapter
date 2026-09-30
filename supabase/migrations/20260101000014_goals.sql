-- Goal (My Chapter aspiration): free-text things a member would still love to
-- do — "Visit Japan", "Learn Italian" — distinct from member_profiles.goals
-- (a single tag picked during onboarding). Multiple per member, member-managed.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  text text not null,
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now()
);

create index goals_member_id_idx on public.goals (member_id);

alter table public.goals enable row level security;

create policy "goals owner or admin select"
  on public.goals for select
  using (member_id = auth.uid() or public.is_admin());

create policy "goals owner insert"
  on public.goals for insert
  with check (member_id = auth.uid());

create policy "goals owner update"
  on public.goals for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "goals owner delete"
  on public.goals for delete
  using (member_id = auth.uid());

-- Explicit grants — a blanket `grant ... on all tables` in an earlier
-- migration only covers tables that existed when it ran, not this one.
grant select, insert, update, delete on public.goals to authenticated;
grant all on public.goals to service_role;

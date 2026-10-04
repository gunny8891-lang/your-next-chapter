-- Daily State: how a member says they are today. Optional, quick, and temporary.
--
-- One row per member per day, replaced if they change their mind. It shapes that
-- day's suggestions and nothing else: it is never turned into a lasting trait ("low
-- energy today" is not "prefers low-energy things"). Only fixed choices are stored,
-- never free text, and old rows are deleted by the nightly job after a week.
--
-- The coarse energy and intention are also copied into the context of that day's
-- experience events, so learning can tell a bad day from a dislike.

create table public.daily_states (
  member_id uuid not null references public.users (id) on delete cascade,
  -- The member's calendar day, in London time.
  state_date date not null,
  energy text not null check (energy in ('low', 'normal', 'high')),
  -- The same vocabulary as the "what do you feel like" choices.
  intention text check (intention in ('surprise', 'outdoors', 'social', 'active', 'culture', 'relaxed', 'food')),
  indoors boolean not null default false,
  less_walking boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (member_id, state_date)
);

create trigger daily_states_set_updated_at
  before update on public.daily_states
  for each row execute function public.set_updated_at();

alter table public.daily_states enable row level security;

create policy "daily states owner select"
  on public.daily_states for select
  using (member_id = auth.uid());

create policy "daily states owner insert"
  on public.daily_states for insert
  with check (member_id = auth.uid());

create policy "daily states owner update"
  on public.daily_states for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy "daily states owner delete"
  on public.daily_states for delete
  using (member_id = auth.uid());

-- Explicit grants, as in every other table migration here.
grant select, insert, update, delete on public.daily_states to authenticated;
grant all on public.daily_states to service_role;

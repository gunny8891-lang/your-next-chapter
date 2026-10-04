-- Ideas a member has saved for later ("Save" on a card).
--
-- Saving was already recorded as a positive preference signal, but that log is
-- append-only by design (members cannot delete from it), so on its own it can
-- show what was saved but never let someone take an idea off their list. This
-- table is the list itself: one row per saved idea, which the member may add to
-- and remove from. Taking an idea off the list does not erase the fact that they
-- liked it: the preference signal stays, and keeps teaching the app what suits them.

create table public.saved_ideas (
  member_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, activity_id)
);

alter table public.saved_ideas enable row level security;

create policy "saved ideas owner select"
  on public.saved_ideas for select
  using (member_id = auth.uid());

create policy "saved ideas owner insert"
  on public.saved_ideas for insert
  with check (member_id = auth.uid());

create policy "saved ideas owner delete"
  on public.saved_ideas for delete
  using (member_id = auth.uid());

-- Everything saved so far was recorded only as a signal: bring it into the list.
insert into public.saved_ideas (member_id, activity_id, created_at)
select member_id, activity_id, min(created_at)
from public.preference_signals
where source = 'explicit_feedback'
  and signal_type = 'liked'
  and activity_id is not null
group by member_id, activity_id
on conflict do nothing;

-- Explicit grants, as in every other table migration here: row-level security only
-- filters rows, and Postgres still requires the table-level privilege before a role
-- can touch the table at all. Members add and remove their own rows; the backend
-- (service role) needs full access.
grant select, insert, delete on public.saved_ideas to authenticated;
grant all on public.saved_ideas to service_role;

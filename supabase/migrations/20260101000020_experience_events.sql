-- The Experience Graph: what actually happens to each idea we put in front of a member.
--
-- preference_signals records a verdict (liked, disliked, too far…) and stays the
-- input to today's scoring. This is the richer record around it: an idea was shown,
-- opened, saved, planned, done (and how it went) or turned down (and why), each with
-- a little context about the day. It is the first-party history that lets the app
-- learn what suits someone, and tell "unsuitable today" from "not for me".
--
-- Append-only for the app's purposes, but a member may delete their own rows: that is
-- how "clear what we've learned" works, and a member's data is theirs to remove.
--
-- context holds only coarse, fixed values (surface, who with, energy, intention, why it
-- was suggested), never free text. See src/lib/experience/events.ts.

create table public.experience_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  -- Null when the activity has since been removed; the history is kept.
  activity_id uuid references public.activities (id) on delete set null,
  event_type text not null check (event_type in ('shown', 'opened', 'saved', 'planned', 'completed', 'dismissed')),
  -- Only for 'completed': how it went.
  outcome text check (outcome in ('loved', 'fine', 'not_for_me')),
  -- Only for 'dismissed': why. 'didnt_go' is something planned that did not happen.
  reason text check (reason in ('not_my_thing', 'too_far', 'too_expensive', 'seen_it', 'didnt_go')),
  surface text check (surface in ('today', 'sheet', 'explore', 'week', 'reflection')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (outcome is null or event_type = 'completed'),
  check (reason is null or event_type = 'dismissed')
);

create index experience_events_member_created_idx on public.experience_events (member_id, created_at desc);
create index experience_events_member_activity_idx on public.experience_events (member_id, activity_id);

alter table public.experience_events enable row level security;

create policy "experience events owner select"
  on public.experience_events for select
  using (member_id = auth.uid() or public.is_admin());

create policy "experience events owner insert"
  on public.experience_events for insert
  with check (member_id = auth.uid());

create policy "experience events owner delete"
  on public.experience_events for delete
  using (member_id = auth.uid());

-- Explicit grants, as in every other table migration here.
grant select, insert, delete on public.experience_events to authenticated;
grant all on public.experience_events to service_role;

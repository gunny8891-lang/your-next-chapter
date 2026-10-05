-- Google Calendar: let a member put their planned outings into their own calendar.
--
-- The connection asks Google for the narrowest permission that does the job
-- (calendar.app.created): the app makes ONE calendar of its own, "Your Next Chapter", and
-- can only add, change and remove events in that calendar. It cannot see anything else in
-- the member's Google Calendar.
--
-- calendar_connections holds the long-lived credential, encrypted by the application
-- before it is stored (AES-256-GCM, key in the environment), so a database leak alone does
-- not give anyone access to a calendar. Only the backend ever reads it: there is
-- deliberately NO member policy and NO grant to the authenticated role, so it can never be
-- read through the browser-facing API, whatever a member's session says.
--
-- calendar_events remembers which Google event belongs to which planned item, so adding
-- the same outing twice does not duplicate it and it can be taken off the calendar again.

create table public.calendar_connections (
  member_id uuid primary key references public.users (id) on delete cascade,
  -- Encrypted by the app (iv.tag.ciphertext, base64). Never stored or logged in clear.
  refresh_token_enc text not null,
  -- The id of the "Your Next Chapter" calendar in the member's Google account.
  calendar_id text,
  scope text not null,
  connected_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;
-- No policies on purpose: with row level security on and none defined, only the
-- backend's service role (which bypasses it) can touch this table.

create table public.calendar_events (
  member_id uuid not null references public.users (id) on delete cascade,
  itinerary_item_id uuid not null references public.itinerary_items (id) on delete cascade,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, itinerary_item_id)
);

alter table public.calendar_events enable row level security;

create policy "calendar events owner select"
  on public.calendar_events for select
  using (member_id = auth.uid());

-- Explicit grants, as in every other table migration here. Members may see which of their
-- items are on their calendar; everything else goes through the backend.
grant select on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;
grant all on public.calendar_connections to service_role;

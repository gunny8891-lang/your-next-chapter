-- What members tell us in the app, and a short record of things that went wrong for them.
--
-- member_feedback: a message a member wrote in the app ("Tell us what you think"), and which part of the app they
-- were in. It is theirs: read by them and by admins, written only by the backend, and removed with the account.
--
-- app_events: that something went wrong (a sign-up that could not be completed, a login refused, a confirmation
-- email that could not be sent, a screen that broke), as a short code of our own. It holds NO person's details: no
-- email address, no name, no member, and never the provider's own words. It exists so that problems can be seen
-- without reading server logs, and is kept for 90 days.
--
-- Both are optional to the app: if either is missing the feature still works (the feedback is emailed, the event
-- simply is not recorded).

create table public.member_feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  -- Where they were: Today, My Week, Explore, Account, ...
  page text not null check (char_length(page) between 1 and 40),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index member_feedback_created_idx on public.member_feedback (created_at desc);

alter table public.member_feedback enable row level security;

create policy "member feedback owner select"
  on public.member_feedback for select
  using (member_id = auth.uid() or public.is_admin());

grant select on public.member_feedback to authenticated;
grant all on public.member_feedback to service_role;

create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('signup_failed', 'login_failed', 'resend_failed', 'reset_failed', 'page_error')),
  -- Our own short code: email_send, rate_limit, weak_password, ... or a screen error's reference. Never free text.
  code text not null check (char_length(code) between 1 and 60),
  created_at timestamptz not null default now()
);

create index app_events_created_idx on public.app_events (created_at desc);

alter table public.app_events enable row level security;

create policy "app events admin select"
  on public.app_events for select
  using (public.is_admin());

grant select on public.app_events to authenticated;
grant all on public.app_events to service_role;

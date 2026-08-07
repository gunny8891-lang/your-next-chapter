-- Nudges: log of proactive nudge messages sent by the daily nudge job — the
-- substrate for the once-per-member-per-week cap and an audit trail of why
-- each nudge fired.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  reason text not null check (reason in ('activity_gap', 'weather_match')),
  message text not null,
  sent_at timestamptz not null default now()
);

create index nudges_member_id_idx on public.nudges (member_id, sent_at);

alter table public.nudges enable row level security;

create policy "nudges owner or admin select"
  on public.nudges for select
  using (member_id = auth.uid() or public.is_admin());

-- Written only by the daily nudge job via the service role — no member-facing
-- insert/update policy needed (same shape as subscriptions' write path).
create policy "nudges admin write"
  on public.nudges for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.nudges to authenticated;
grant all on public.nudges to service_role;

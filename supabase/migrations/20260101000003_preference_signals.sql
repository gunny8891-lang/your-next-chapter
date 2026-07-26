-- PreferenceSignal: append-only log — the substrate the Memory Agent learns from.
create table public.preference_signals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  source text not null check (source in ('accept', 'skip', 'swap', 'explicit_feedback', 'surprise_me_response')),
  activity_id uuid references public.activities (id) on delete set null,
  signal_type text not null check (signal_type in ('liked', 'disliked', 'too_far', 'too_expensive', 'too_similar', 'wrong_pace')),
  created_at timestamptz not null default now()
);

create index preference_signals_member_id_idx on public.preference_signals (member_id);
create index preference_signals_activity_id_idx on public.preference_signals (activity_id);

alter table public.preference_signals enable row level security;

create policy "preference signals owner or admin select"
  on public.preference_signals for select
  using (member_id = auth.uid() or public.is_admin());

create policy "preference signals owner insert"
  on public.preference_signals for insert
  with check (member_id = auth.uid());

-- No update/delete policy: append-only by design.

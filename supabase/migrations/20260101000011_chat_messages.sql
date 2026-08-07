-- ChatMessage: append-only conversation log backing the on-demand concierge chat.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_member_id_idx on public.chat_messages (member_id, created_at);

alter table public.chat_messages enable row level security;

create policy "chat messages owner or admin select"
  on public.chat_messages for select
  using (member_id = auth.uid() or public.is_admin());

create policy "chat messages owner insert"
  on public.chat_messages for insert
  with check (member_id = auth.uid());

-- No update/delete policy: append-only by design, matching preference_signals.

grant select, insert on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;

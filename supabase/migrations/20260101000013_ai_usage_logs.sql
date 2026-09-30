-- AiUsageLog: append-only log of every Claude API call made by the app —
-- tokens, cost, latency, success — so cost is visible per-feature/per-model
-- from day one rather than retrofitted later (see project brief section 23).
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  estimated_cost numeric not null default 0,
  latency_ms integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index ai_usage_logs_user_id_idx on public.ai_usage_logs (user_id);
create index ai_usage_logs_feature_idx on public.ai_usage_logs (feature);
create index ai_usage_logs_created_at_idx on public.ai_usage_logs (created_at);

alter table public.ai_usage_logs enable row level security;

-- Only admins read usage data; there's no member-facing view of this yet.
create policy "ai usage logs admin select"
  on public.ai_usage_logs for select
  using (public.is_admin());

-- Most calls log via the service role (which bypasses RLS), but the concierge
-- chat runs on the member's own session client, so it needs to insert its
-- own rows directly.
create policy "ai usage logs own insert"
  on public.ai_usage_logs for insert
  with check (user_id = auth.uid());

-- No update/delete policy: append-only by design.

-- `grant ... on all tables in schema public` in earlier migrations only covers
-- tables that existed at the time it ran — it does not apply retroactively to
-- a table created later, so this table needs its own explicit grants (same
-- root cause as the missing grants found earlier in this project).
grant select, insert on public.ai_usage_logs to authenticated;
grant all on public.ai_usage_logs to service_role;


-- DiscoveryRegion: one row per location the Discovery Agent has searched, so
-- the (expensive) web search is not repeated for a place that was searched
-- recently. A single regional search costs on the order of $1 in tokens, and
-- previously ran for every member location every night.
create table public.discovery_regions (
  region_key text primary key,              -- normalized: lowercased, "near " stripped, whitespace collapsed
  region_label text not null,               -- the text actually searched
  last_attempt_at timestamptz not null,     -- set when a search is claimed; guards against duplicate in-flight runs
  last_success_at timestamptz,
  empty_runs integer not null default 0,    -- consecutive successful searches that found nothing new — drives backoff
  consecutive_failures integer not null default 0, -- incremented at claim time, reset on success, so a run killed mid-way still counts
  last_found integer not null default 0,
  last_inserted integer not null default 0,
  last_error text
);

alter table public.discovery_regions enable row level security;

-- Written only by the discovery job via the service role; admins can read it.
create policy "discovery regions admin select"
  on public.discovery_regions for select
  using (public.is_admin());

-- Explicit grants — a blanket `grant ... on all tables` in an earlier
-- migration only covers tables that existed when it ran, not this one.
grant select on public.discovery_regions to authenticated;
grant all on public.discovery_regions to service_role;

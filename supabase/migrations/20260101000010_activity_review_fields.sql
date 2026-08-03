-- Supports curated seed entries whose real-world schedule/provider needs confirming
-- before the Itinerary Agent should ever recommend them to a member.
alter table public.activities drop constraint activities_status_check;
alter table public.activities add constraint activities_status_check
  check (status in ('active', 'expired', 'removed', 'needs_review'));

-- Internal-only curation notes (e.g. "confirm current schedule") — distinct from
-- `description`, which is member-facing copy shown in itinerary rationale context.
alter table public.activities add column admin_notes text;

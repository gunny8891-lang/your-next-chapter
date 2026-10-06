-- Records that a member agreed to our terms of use and read our privacy notice, which
-- version of each, and when.
--
-- One row per member, document and version, so if the wording changes later (a new
-- version) a member can be asked again and both agreements are kept. Written only by the
-- backend, at the moment the member signs up: members can read their own record but
-- cannot add, change or remove one, so it cannot be edited after the fact.
--
-- Deliberately holds nothing else (no IP address, no browser details): the minimum that
-- shows who agreed to what, and when. It belongs to the member, so it is removed with the
-- account like everything else the member's account holds.
--
-- Members who signed up before this existed have no rows: we do not claim they agreed to
-- a version they were never shown.

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  -- The version shown, as the date the wording was last changed (YYYY-MM-DD).
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  -- Where the agreement was given: ticking the box when creating the account, or later
  -- when asked to agree to a changed version.
  source text not null default 'signup' check (source in ('signup', 'reaccept')),
  unique (member_id, document, version)
);

alter table public.legal_acceptances enable row level security;

create policy "legal acceptances owner select"
  on public.legal_acceptances for select
  using (member_id = auth.uid() or public.is_admin());

-- Explicit grants, as in every other table migration here. A member may only read their own
-- record; every write goes through the backend's service role.
grant select on public.legal_acceptances to authenticated;
grant all on public.legal_acceptances to service_role;

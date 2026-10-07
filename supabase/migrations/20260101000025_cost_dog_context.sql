-- Cost and dog access as first-class facts about a place, and the member's side of both.
--
-- Cost: price_estimate (one number) stays, so everything that reads it keeps working. These add what a
-- single number cannot say: a range, what kind of price it is, how sure we are, and whether it needs
-- booking. The consumer-facing tier (Free, £, ££, £££) is worked out in code from these, never stored.
--
-- Dog access: stored as what we KNOW. A place is never assumed dog-friendly because it is outdoors, so
-- the default is 'unknown'; 'verified' needs a source (a page, a sign, a tag) and 'reported' is a
-- second-hand claim. When someone says the dog is coming, anything known to refuse dogs is left out.
--
-- Members: whether they have a dog (and what it is called), whether it usually comes along, and a
-- fourth cost-comfort answer, "don't worry too much about cost", which is not the same as never having
-- been asked (null). The existing member_profiles row policies and table-level grants already cover
-- new columns, so nothing else is needed. Nothing here is required: every column is optional or has a
-- default, and existing rows are unchanged in meaning.

alter table public.activities
  add column price_min numeric check (price_min is null or price_min >= 0),
  add column price_max numeric check (price_max is null or price_max >= 0),
  add column price_type text not null default 'unknown'
    check (price_type in ('free', 'entry', 'per_person', 'from', 'unknown')),
  add column cost_confidence text not null default 'unknown'
    check (cost_confidence in ('known', 'estimated', 'unknown')),
  add column booking_required boolean,
  add column dog_access text not null default 'unknown'
    check (dog_access in ('allowed', 'outdoor_only', 'selected_areas', 'assistance_dogs_only', 'not_allowed', 'unknown')),
  add column dog_restrictions text,
  add column dog_confidence text not null default 'unknown'
    check (dog_confidence in ('verified', 'reported', 'unknown')),
  add column dog_source text;

-- Prices already held came from several sources and were never marked as checked, so they are
-- called estimates: the app says "about" rather than promising an exact figure.
update public.activities set price_type = 'free', cost_confidence = 'estimated' where price_estimate = 0;
update public.activities set price_type = 'entry', cost_confidence = 'estimated' where price_estimate > 0;

alter table public.member_profiles
  add column has_dog boolean not null default false,
  add column dog_name text check (dog_name is null or char_length(dog_name) <= 60),
  add column dog_usually_comes boolean not null default false;

alter table public.member_profiles drop constraint if exists member_profiles_budget_band_check;
alter table public.member_profiles add constraint member_profiles_budget_band_check
  check (budget_band in ('low', 'medium', 'high', 'any'));

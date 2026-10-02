-- The last moment an activity is still available. Distinct from date_time (the
-- start of a single one-off event): an exhibition, a seasonal series, or a
-- run of guided walks "through to 1 November" is bookable on many dates, so
-- one sample date_time would wrongly mark it finished the day after.
--
-- Null for one-off events (date_time already says when they end up past) and
-- for standing groups/venues that never expire. Not a status change on
-- purpose: members can't read non-active activities, so flipping status to
-- 'expired' would make past items vanish from their own week view.
alter table public.activities add column expires_at timestamptz;

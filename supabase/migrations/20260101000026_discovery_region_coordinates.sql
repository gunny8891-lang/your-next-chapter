-- A discovery region is a PLACE, not a piece of text. Until now a region was keyed by the words a member typed, so
-- "Stevenage", "Stevenage, Hertfordshire" and a postcode in Stevenage were three regions and each started its own
-- paid web search (about $1.30) for somewhere already searched.
--
-- With the centre of each searched region recorded, a new request is matched to an existing region by distance
-- (see SAME_PLACE_KM in throttle.ts), whatever the person typed, and the existing region's own name is what gets
-- searched. Both columns are optional: a row without them still matches by its text, as before, until they are
-- filled in.
alter table public.discovery_regions
  add column lat double precision,
  add column lng double precision;

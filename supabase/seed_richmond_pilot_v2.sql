-- Additional real-organization activities for the Richmond upon Thames pilot,
-- sourced from richmond-pilot-seed-activities.md. Run after 20260101000010
-- (needs_review status + admin_notes column) is applied.
-- Skipped from the source file: "NHS health check reminder" (#13) — that's a
-- future Phase 2 system notification concept, not a real bookable activity.
-- Merged rather than duplicated: "Ham House & Garden" (#8) enriches the
-- existing "Ham House & Gardens" row instead of inserting a near-duplicate.

update public.activities
set description = 'A 17th-century house on the Thames with guided tours, an Orangery café, and seasonal events (lawn games, chess, sensory walks, cabinet exhibitions). Free entry with National Trust membership.'
where title = 'Ham House & Gardens';

insert into public.activities
  (title, description, category, address, recurrence_rule, price_estimate, booking_url, source, tags, accessibility_notes, status, admin_notes)
values
  ('Richmond Ramblers Walking Group', 'Varied group walks from 4 to 12 miles across Richmond and Surrey, weekends and midweek. Ramblers membership is optional, not required to join a walk.', 'Move', 'Richmond & Surrey area', 'Weekly, varied days — see ramblers.org.uk', 0, 'https://www.ramblers.org.uk', 'manual', array['walking','outdoors','fitness'], 'Walk lengths and terrain vary by group; shorter/easier options usually available.', 'active', null),
  ('Richmond upon Thames Health Walks', 'Free, gentle 45-70 minute group walks led by trained volunteers. All abilities welcome, with shorter and slower options for beginners.', 'Move', 'Richmond upon Thames (multiple start points)', 'Weekly, various days — see richmond.gov.uk/health_walks', 0, 'https://www.richmond.gov.uk/health_walks', 'manual', array['walking','outdoors','fitness','accessible'], 'Beginner-paced options available at every walk.', 'active', null),
  ('Age UK London — Gentle Park Stroll', 'An easy-paced walk of up to 5 miles, no pressure on pace — suitable for those recovering from illness or just starting to get active again.', 'Move', 'Richmond upon Thames area parks', 'Regular — check local Age UK schedule', 0, 'https://www.ageuk.org.uk/london', 'manual', array['walking','gentle','accessible'], 'Explicitly designed for those easing back into activity.', 'active', null),

  ('Richmond upon Thames U3A Monthly Meeting', 'Open monthly meeting with talks and social time; new visitors welcome for up to two trial visits before joining.', 'Connect', 'Clarendon Hall, York House, Twickenham TW1 3BZ', 'Last Wednesday of the month, 2:30pm', 2, 'https://rut.u3asite.uk', 'manual', array['social','u3a'], 'Refreshments included; free for U3A members.', 'active', null),
  ('Coffee Morning / Social Group', 'A recurring local coffee/social group near Richmond station.', 'Connect', 'Near Richmond station (exact venue to be confirmed)', null, null, null, 'manual', array['coffee','social'], null, 'needs_review', 'Needs a specific recurring group confirmed via the Richmond CVS directory before this can be recommended to members.'),

  ('U3A Richmond upon Thames Subject Groups', 'A wide range of subject-specific courses and classes (languages, art, history, and more) run by local Section Leaders.', 'Learn', 'Richmond upon Thames (various venues, via U3A)', 'Ongoing, termly groups', null, 'https://rut.u3asite.uk', 'manual', array['learning','u3a'], null, 'active', 'Exact subject list and pricing varies by group — check current offerings via the U3A site.'),
  ('Watercolour / Craft Taster Session', 'A community hall taster class in watercolour painting or another craft.', 'Learn', 'Community hall, Richmond (exact venue to be confirmed)', null, null, null, 'manual', array['art','creative'], null, 'needs_review', 'Needs a specific confirmed session via local council adult-education listings.'),

  ('Ham House Circular Walk', 'A free guided walk taking in Richmond Park views and Richmond Hill, finishing near Ham House.', 'Explore', 'Ham House, Richmond TW10 (start point)', null, 0, 'https://www.nationaltrust.org.uk/ham-house', 'manual', array['walking','outdoors','national_trust'], 'Guided pace; route includes some hills.', 'active', null),

  ('Age UK Richmond upon Thames — Volunteering', 'Volunteer roles include befriending, benefits support calls, home visits, and fundraising events. Requires a free DBS check (arranged by Age UK); a minimum 6-month commitment is typical.', 'Give Back', 'Richmond upon Thames (various placements)', null, 0, 'https://www.ageuk.org.uk/richmonduponthames', 'manual', array['volunteering','community'], null, 'active', 'Contact volunteering@ageukrichmond.org.uk to get started.'),
  ('Richmond CVS Volunteering Hub', 'A local hub matching volunteers to opportunities across the borough, including Habitats & Heritage conservation work.', 'Give Back', 'Richmond upon Thames (borough-wide)', null, 0, 'https://www.richmond.gov.uk/volunteering_richmond', 'manual', array['volunteering','community','conservation'], null, 'active', null),

  ('Gentle Yoga / Tai Chi Class', 'A gentle yoga or tai chi class run through a local leisure centre or U3A.', 'Wellness', 'Richmond leisure centres / U3A (exact venue to be confirmed)', null, null, null, 'manual', array['yoga','tai_chi','wellness'], null, 'needs_review', 'Needs current provider and times confirmed locally before recommending.'),

  ('Ham House Orangery Café', 'Cream tea and cake in the walled garden café — pairs naturally with a Ham House visit.', 'Joy', 'The Orangery, Ham House, Richmond TW10', null, null, 'https://www.nationaltrust.org.uk/ham-house', 'manual', array['treat','food'], 'Step-free access.', 'active', null),
  ('Open Mic Night, The Fox and Duck', 'A lighter, livelier evening option for members who enjoy music and a social atmosphere.', 'Joy', 'The Fox and Duck, Petersham Road, Richmond', 'Fridays, 8:00pm', null, null, 'manual', array['music','social'], null, 'active', null);

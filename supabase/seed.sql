-- Manually curated pilot-region activities for Richmond, London (spec section 2 & 6.1:
-- Discovery Agent is a later phase; MVP starts from a human-curated top-up).
-- Run this once against the live project after the schema migrations are applied.

insert into public.activities
  (title, description, category, address, recurrence_rule, duration_minutes, price_estimate, booking_url, source, tags, accessibility_notes, rating, status)
values
  ('Riverside Walking Group', 'A relaxed group walk along the Thames towpath, all paces welcome.', 'Move', 'Richmond Lock, Richmond TW9', 'Every Monday, 9:00am', 60, 0, null, 'manual', array['walking','outdoors','fitness'], 'Flat towpath, suitable for most mobility levels.', 4.7, 'active'),
  ('Park Run 5k', 'Free, timed 5k run/walk/jog every Saturday morning.', 'Move', 'Old Deer Park, Richmond TW9', 'Every Saturday, 9:00am', 45, 0, 'https://www.parkrun.org.uk/', 'manual', array['running','fitness','outdoors'], 'Route is flat gravel/grass; walkers welcome.', 4.8, 'active'),
  ('Cycling Club Social Ride', 'Easy-paced social ride through Richmond Park, regroup stops throughout.', 'Move', 'Richmond Park, Richmond TW10', 'Every Sunday, 8:30am', 90, 0, null, 'manual', array['cycling','outdoors','fitness'], 'Own bike required; moderate fitness level.', 4.5, 'active'),

  ('Coffee with the Local History & Gardening Group', 'Informal weekly coffee meet-up for people into local history and gardening.', 'Connect', 'The Brew House, Richmond TW9', 'Every Tuesday, 11:00am', 60, 6, null, 'manual', array['coffee','social','history','gardening'], 'Step-free access.', 4.6, 'active'),
  ('Men''s Shed Richmond', 'Woodworking and small-repairs workshop with a strong social side.', 'Connect', 'Richmond Community Hall, Richmond TW9', 'Every Wednesday, 10:00am', 120, 0, null, 'manual', array['woodworking','social','crafts'], 'Workshop has a step at the entrance.', 4.7, 'active'),
  ('U3A Book Club', 'Monthly-themed weekly discussion group, new members always welcome.', 'Connect', 'Richmond Library, Richmond TW9', 'Every Thursday, 2:00pm', 90, 0, null, 'manual', array['reading','social'], 'Fully accessible venue.', 4.5, 'active'),
  ('Board Games Social', 'Casual games evening — cards, board games, and tea/coffee.', 'Connect', 'Richmond Community Hall, Richmond TW9', 'Every Friday, 6:00pm', 120, 2, null, 'manual', array['games','social'], 'Step-free access.', 4.4, 'active'),

  ('Watercolour Taster Session', 'Beginner-friendly watercolour painting session, materials provided.', 'Learn', 'Richmond Community Hall, Richmond TW9', 'Every Wednesday, 2:00pm', 90, 8, null, 'manual', array['art','creative','painting'], 'Step-free access, adjustable-height tables available.', 4.6, 'active'),
  ('Richmond Local History Talk', 'Weekly talk series on Richmond''s history, different topic each week.', 'Learn', 'Richmond Library, Richmond TW9', 'Every Tuesday, 6:30pm', 60, 0, null, 'manual', array['history','talks'], 'Fully accessible venue, hearing loop available.', 4.5, 'active'),
  ('Beginners Spanish Class', 'Relaxed-pace conversational Spanish for absolute beginners.', 'Learn', 'Richmond Adult & Community College, Richmond TW9', 'Every Monday, 6:00pm', 90, 6, null, 'manual', array['language','learning'], 'Lift access available.', 4.3, 'active'),
  ('Photography Walkshop', 'Guided photography walk covering composition and using your own camera or phone.', 'Learn', 'Old Deer Park, Richmond TW9', 'Every Saturday, 10:00am', 120, 10, null, 'manual', array['photography','creative','outdoors'], 'Flat outdoor route.', 4.6, 'active'),

  ('Ham House & Gardens', 'National Trust 17th-century house and gardens beside the Thames.', 'Explore', 'Ham House, Richmond TW10', null, 150, 14.5, 'https://www.nationaltrust.org.uk/ham-house', 'manual', array['history','gardens','national_trust'], 'Ground floor and gardens are wheelchair accessible.', 4.7, 'active'),
  ('Richmond Park Deer Walk', 'Self-guided walk through Richmond Park to see the wild deer herds.', 'Explore', 'Richmond Park, Richmond TW10', null, 90, 0, null, 'manual', array['wildlife','walking','outdoors'], 'Mostly flat paths; some are unpaved.', 4.8, 'active'),
  ('Hampton Court Palace Visit', 'A half-day out at the former royal palace and its famous maze.', 'Explore', 'Hampton Court Palace, East Molesey KT8', 'Fridays, 11:00am', 180, 12, 'https://www.hrp.org.uk/hampton-court-palace/', 'manual', array['history','day_trip'], 'Accessible routes available; some cobbled areas.', 4.7, 'active'),
  ('Kew Gardens Afternoon Tea at The Orangery', 'A relaxed afternoon tea inside Kew Gardens'' historic Orangery.', 'Joy', 'The Orangery, Kew Gardens, Richmond TW9', 'Sundays, 3:00pm', 90, 24, 'https://www.kew.org/kew-gardens', 'manual', array['treat','food'], 'Step-free access.', 4.6, 'active'),

  ('Reading Volunteer — St. Mary''s Primary', 'Hear primary-age children read one-to-one, DBS check arranged by the school.', 'Give Back', 'St. Mary''s Primary School, Richmond TW9', 'Every Friday, 9:30am', 45, 0, null, 'manual', array['volunteering','children'], 'Step-free access.', 4.9, 'active'),
  ('Food Bank Sorting Shift', 'Sort and pack donations for local families in need.', 'Give Back', 'Richmond Foodbank, Richmond TW9', 'Every Wednesday, 10:00am', 120, 0, null, 'manual', array['volunteering','community'], 'Some light lifting involved; seated tasks available.', 4.7, 'active'),
  ('Charity Shop Volunteer Shift', 'Help sort donations and serve customers at a local hospice charity shop.', 'Give Back', 'Local Hospice Shop, Richmond TW9', 'Every Tuesday, 10:00am', 180, 0, null, 'manual', array['volunteering','retail'], 'Seated tasks available.', 4.5, 'active'),

  ('Gentle Yoga for Flexibility', 'Slow-paced yoga session focused on mobility and flexibility, chairs available.', 'Wellness', 'Riverside Studio, Richmond TW9', 'Every Saturday, 10:00am', 60, 5, null, 'manual', array['yoga','wellness'], 'Chair-based options available.', 4.8, 'active'),
  ('Tai Chi in the Park', 'Beginner-friendly tai chi session outdoors, all levels welcome.', 'Wellness', 'Old Deer Park, Richmond TW9', 'Every Wednesday, 9:00am', 45, 0, null, 'manual', array['tai_chi','wellness','outdoors'], 'Standing session; grass surface.', 4.6, 'active'),
  ('Mindfulness & Meditation Group', 'Guided meditation and relaxation session for stress and wellbeing.', 'Wellness', 'Richmond Community Hall, Richmond TW9', 'Every Monday, 5:30pm', 45, 3, null, 'manual', array['meditation','wellness'], 'Step-free access, seated throughout.', 4.7, 'active'),

  ('Live Jazz Night', 'Local jazz trio playing live, relaxed pub atmosphere.', 'Joy', 'The Bull''s Head, Barnes SW13', 'Every Friday, 8:00pm', 120, 8, null, 'manual', array['music','social'], 'Step-free access.', 4.5, 'active'),
  ('Sunday Roast Social', 'A traditional Sunday roast with a friendly regular crowd.', 'Joy', 'The Britannia, Richmond TW9', 'Every Sunday, 1:00pm', 90, 15, null, 'manual', array['food','social','treat'], 'Step-free access.', 4.6, 'active'),
  ('Cinema Matinee', 'Weekday matinee screening, popular with retirees for the quieter crowd.', 'Joy', 'Richmond Filmhouse, Richmond TW9', 'Every Wednesday, 2:00pm', 120, 6, null, 'manual', array['film','treat'], 'Wheelchair-accessible screen and seating.', 4.4, 'active');

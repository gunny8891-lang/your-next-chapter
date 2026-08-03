# Richmond upon Thames — Pilot Seed Activities

Real organisations and venues for the pilot area, mapped to the 7 weekly-balance categories from the spec. Verify current schedules/prices before going live — some entries below list the organisation and general offering rather than a specific date, since exact sessions change term to term. Flag these as `needs_schedule_confirmation: true` in the DB so the Discovery Agent (or a human) refreshes them before the itinerary engine relies on them.

## Move
1. **Richmond Ramblers walking group** — varied walks 4–12 miles, weekends and midweek, Richmond/Surrey area. Free (Ramblers membership optional). Source: ramblers.org.uk
2. **Richmond upon Thames Health Walks** — free, gentle 45–70 min group walks led by trained volunteers, all abilities welcome, shorter/slower options for beginners. Source: richmond.gov.uk/health_walks
3. **Age UK London — Gentle Park Stroll** — up to 5 miles, no-pressure pace, suitable for those recovering from illness or just starting out. Source: ageuk.org.uk/london

## Connect
4. **Richmond upon Thames U3A — monthly meetings** — last Wednesday of the month, 2:30pm, Clarendon Hall, York House, Twickenham TW1 3BZ. £2 for non-members (2 trial visits), free for members, refreshments included. Source: rut.u3asite.uk
5. **Coffee morning / social group** — needs_schedule_confirmation — pair with a local café near Richmond station once a specific recurring group is confirmed (e.g. via Richmond CVS directory).

## Learn
6. **U3A Richmond upon Thames — subject groups** — wide range of subject-specific courses/classes run by local Section Leaders (languages, art, history, etc. — exact list via their site). Source: rut.u3asite.uk
7. **Watercolour/craft taster session** — needs_schedule_confirmation — community hall class, similar to prototype example; confirm via local council adult-education listings.

## Explore
8. **Ham House & Garden (National Trust)** — 17th-century house on the Thames, guided tours, Orangery café, seasonal events (lawn games, chess, sensory walks, cabinet exhibitions). Free entry with NT membership. Source: nationaltrust.org.uk
9. **Ham House circular walk** — free guided walk taking in Richmond Park views and Richmond Hill, finishing point near the house. Source: nationaltrust.org.uk

## Give Back
10. **Age UK Richmond upon Thames — volunteering** — roles include befriending, benefits support calls, home visits, fundraising events; requires DBS check (free, arranged by Age UK), min. 6-month commitment typical. Contact: volunteering@ageukrichmond.org.uk. Source: ageuk.org.uk/richmonduponthames
11. **Richmond CVS (Council for Voluntary Service)** — local hub matching volunteers to opportunities across the borough, including Habitats & Heritage conservation work. Source: richmond.gov.uk/volunteering_richmond

## Wellness
12. **Gentle yoga / Tai Chi class** — needs_schedule_confirmation — Richmond leisure centres and U3A both run these; confirm current provider and times locally.
13. **NHS health check reminder** — not a booking, a system-generated reminder (per spec section on Health & Wellness Agent, Phase 2).

## Joy
14. **Ham House Orangery café** — cream tea/cake in the walled garden café, pairs naturally with a Ham House visit. Source: nationaltrust.org.uk
15. **Open Mic Night, The Fox and Duck** — Fridays 8pm, Petersham Road, Richmond — lighter/evening social option for members who enjoy music and a livelier atmosphere. Source: visitrichmond.co.uk

---

## Loading into Supabase

Give Claude Code something like:

> Using the entries in `richmond-pilot-seed-activities.md`, write a Supabase migration (or seed script) that inserts these into the `Activity` table per the schema in the spec. For each entry without a specific date/time, set `status = 'needs_review'` and add a `notes` field flagging it for schedule confirmation before the Itinerary Agent uses it in a live recommendation. Use real addresses/coordinates for Richmond upon Thames where you can determine them, and leave `price_estimate` as a text range (e.g. "Free", "£2–5") rather than inventing precise figures we haven't confirmed.

This gives you ~15 real, verifiable activities across all 7 categories to launch the pilot with — enough for the Itinerary Agent to actually produce a varied, believable week rather than repeating 7 fixed items.

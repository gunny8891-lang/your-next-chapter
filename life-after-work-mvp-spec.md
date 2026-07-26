# Life After Work — MVP Product & Technical Specification

**Purpose:** hand this to a developer, dev agency, or AI build tool (e.g. Polsia, Cursor, Claude Code) to begin building the website and app.

---

## 1. Product Summary

An AI-powered retirement concierge for UK retirees. The user has one conversation-style relationship with a single AI assistant. Behind it, specialist agents discover, evaluate, price, and book real-world activities, then assemble them into a personalised weekly plan.

**Core loop:** Onboard once → AI builds a profile → AI generates a weekly plan → user accepts/adjusts/books → AI learns from what worked → plan improves every week.

---

## 2. MVP Scope (Phase 1, 6–8 weeks)

Build only what's needed to prove the core loop end-to-end for a small pilot group (50–200 users, one or two UK regions).

**In scope:**
- Conversational AI onboarding
- User profile (structured + evolving preference data)
- Weekly itinerary generation (AI-curated, not yet fully automated booking)
- Manual-curated local activity/event database for pilot region(s), refreshed via a Discovery Agent
- "Accept / Swap / Skip" on each itinerary item
- External booking links (affiliate/referral — not in-app payment yet)
- Email + web push weekly itinerary delivery
- Basic account, login, subscription paywall (Stripe)
- "Surprise Me" weekly feature

**Explicitly out of scope for MVP** (phase 2/3, noted where relevant below):
- In-app payment/booking with providers
- Family Dashboard
- Social/companion matching
- Insurance and healthcare partner integrations
- Native mobile app (MVP is a mobile-responsive web app; wrap in Capacitor/PWA later if needed)

---

## 3. User Roles

| Role | Description |
|---|---|
| **Member (retiree)** | Primary user. Onboards, receives itinerary, books activities. |
| **Family member** (phase 2) | Optional linked account with limited, opt-in visibility into a member's activity. |
| **Partner/provider** (phase 2) | Local business or organisation whose events/experiences are listed. |
| **Admin** | Internal team member curating events, managing partners, moderating content. |

---

## 4. Core User Journeys

### 4.1 Onboarding Interview
1. User signs up (email or Google/Apple sign-in).
2. Conversational AI interview (chat UI, not a long form) covering: location, mobility/travel radius, interests, personality (group size preference, pace, mornings/evenings), goals ("what would make retirement amazing?"), budget comfort level.
3. AI summarises the profile back to the user for confirmation/edit ("Here's what I've got — does this sound right?").
4. Profile saved; user lands on their first generated week.

### 4.2 Weekly Itinerary Generation
1. Runs every Sunday evening (batch job) for each active member.
2. Itinerary Agent pulls: member profile, local activity database (filtered by radius/mobility), weather forecast for the week, member's past feedback/history.
3. Produces a 5–7 day plan balanced across categories: Move, Connect, Learn, Explore, Give Back, Wellness, Joy (see Section 6.3).
4. Delivered via email + shown on web app home screen.
5. Each day/item has: title, time, location, cost estimate, distance, "why we picked this," and Accept / Swap / Skip actions.

### 4.3 Surprise Me
1. Member opts in and sets a monthly budget cap and travel radius.
2. Each Friday, one curated "stretch" experience (slightly outside their usual pattern but plausible given profile) is generated and shown as a distinct card, separate from the regular weekly plan.
3. Member can accept (adds to next week) or dismiss.

### 4.4 Booking Flow (MVP = referral, not in-app transaction)
1. Member taps "Book" on an itinerary item.
2. App shows pricing/availability info pulled at Discovery time (best-effort, not guaranteed live) and an outbound link/affiliate link to the provider's own booking page.
3. On return, app asks "Did you book this?" (Yes/No/Not yet) to close the feedback loop for the Memory Agent — this is how MVP tracks conversion without needing full booking-API integrations.
4. Phase 2: direct in-app booking via provider APIs or a booking-agent service for select high-volume partners (e.g. National Trust, coach operators).

### 4.5 Family Dashboard (Phase 2 — spec included now so data model supports it later)
- Member explicitly invites a family member and chooses what's visible (e.g. "activities attended," "wellbeing score," but never full message/profile detail).
- Family member gets a read-only summary view + optional weekly digest email.

---

## 5. Data Model

Entities, key fields, and relationships. Use this as the basis for your database schema (Postgres recommended).

### `User`
- `id`, `email`, `auth_provider`, `role` (member/family/admin/partner), `created_at`, `status` (active/paused/cancelled)

### `MemberProfile` (1:1 with User where role=member)
- `id`, `user_id` (FK)
- `location` (postcode/lat-long), `travel_radius_km`, `drives` (bool), `uses_public_transport` (bool)
- `mobility_notes`, `dietary_preferences`
- `personality` (JSON: group_size_pref, pace_pref, time_of_day_pref, spontaneity_score)
- `interests` (array/tags: history, gardening, golf, wildlife, theatre, travel, cooking, reading, volunteering, photography, DIY, music, ...)
- `goals` (array/tags: meet_people, fitness, learn_language, travel_more, give_back, ...)
- `budget_band` (low/medium/high or £ per week)
- `onboarding_transcript` (raw conversational log, for future re-mining)
- `updated_at`

### `PreferenceSignal` (append-only log — this is the "learning" substrate)
- `id`, `member_id` (FK)
- `source` (accept/skip/swap/explicit_feedback/surprise_me_response)
- `activity_id` (FK, nullable)
- `signal_type` (liked/disliked/too_far/too_expensive/too_similar/wrong_pace)
- `created_at`

### `Activity` (an instance of something bookable — event, class, venue offer)
- `id`, `title`, `description`, `category` (Move/Connect/Learn/Explore/GiveBack/Wellness/Joy)
- `provider_id` (FK to Partner, nullable for MVP-curated entries)
- `location` (lat/long, address), `date_time` (or recurring schedule), `duration`
- `price_estimate`, `booking_url`, `source` (manual/discovery_agent/partner_feed)
- `tags` (array, maps to interests), `accessibility_notes`
- `rating` (avg from feedback), `status` (active/expired/removed)

### `Itinerary`
- `id`, `member_id` (FK), `week_start_date`, `generated_at`, `status` (draft/sent/completed)

### `ItineraryItem`
- `id`, `itinerary_id` (FK), `activity_id` (FK), `day_of_week`, `slot` (morning/afternoon/evening)
- `member_action` (pending/accepted/swapped/skipped), `booked_confirmed` (bool/null), `rationale_text` (AI-generated "why we picked this")

### `SurpriseMeCard`
- `id`, `member_id` (FK), `week_start_date`, `activity_id` (FK), `member_response` (accepted/dismissed)

### `Partner` (Phase 2, but stub the table now)
- `id`, `org_name`, `category`, `contact_info`, `commission_rate`, `listing_status`

### `Subscription`
- `id`, `user_id` (FK), `plan` (standard/family), `status`, `stripe_customer_id`, `renewal_date`

### `FamilyLink` (Phase 2)
- `id`, `member_id` (FK), `family_user_id` (FK), `visibility_settings` (JSON), `status` (pending/accepted)

---

## 6. AI Agent Architecture

Each "agent" can start as a scheduled script or LLM-orchestrated function call for MVP — you do not need a full multi-agent framework on day one. Design the interfaces now so agents can be split into independent services later.

### 6.1 Agent Summary

| Agent | Responsibility | MVP implementation |
|---|---|---|
| **Onboarding/Interview Agent** | Conversational profile-building | LLM chat with structured extraction into `MemberProfile` |
| **Discovery Agent** | Finds local events/activities | Scheduled scraper/API-puller (council sites, National Trust, Eventbrite, Meetup) writing into `Activity` table; human-curated top-up for pilot region |
| **Itinerary Agent** | Builds the balanced weekly plan | LLM call with structured prompt: profile + candidate activities (from DB, pre-filtered by radius/tags) + weather + past signals → returns ranked, balanced week |
| **Pricing/Deals Agent** | Surfaces cost and any discounts | MVP: static price field on `Activity`, refreshed manually/by Discovery Agent |
| **Booking Agent** | Confirms bookings | MVP: outbound referral link + "did you book?" follow-up. Phase 2: real API bookings |
| **Health & Wellness Agent** | Preventive reminders (eye test, flu jab, etc.) | Phase 2 |
| **Social Agent** | Matches compatible members | Phase 2/3 |
| **Travel Agent** | Multi-stop day/weekend planning | Phase 2 |
| **Family Agent** | Opt-in updates to linked family | Phase 2 |
| **Memory Agent** | Turns `PreferenceSignal` history into better future recommendations | MVP: simple weighted scoring feeding into Itinerary Agent prompt; Phase 2: proper preference model/embedding-based retrieval |

### 6.2 Itinerary Agent — MVP prompt structure (illustrative)

Inputs assembled by your backend, then passed to the LLM:
- Member profile (structured JSON)
- Last 4 weeks of `PreferenceSignal` (what they accepted/skipped and why)
- 30–50 candidate `Activity` records within radius and matching at least one interest tag
- Weather forecast for the week
- Any "Give Back," "Move," "Connect" category gaps from recent weeks (to keep balance)

Output: structured JSON of 5–7 itinerary items, each with day, slot, activity_id, and a one-sentence rationale — parsed directly into `ItineraryItem` rows. Validate the JSON against a schema before saving; if generation fails validation, retry once, then fall back to a rules-based pick (highest-rated unused activities matching top 3 interest tags).

### 6.3 Weekly Balance Categories
Move · Connect · Learn · Explore · Give Back · Wellness · Joy — the Itinerary Agent should aim to hit at least 4 of these 7 per week, never more than 2 items from the same category, unless the member's stated goals justify skew (e.g. someone training for a specific walking challenge).

---

## 7. System Architecture / Tech Stack (recommended, adjust to your team's skills)

- **Frontend:** Next.js (React), mobile-responsive PWA. Wrap with Capacitor for app-store presence once validated — avoids building two codebases for MVP.
- **Backend:** Node.js/TypeScript API (or Python/FastAPI if your team prefers, given AI-heavy logic).
- **Database:** Postgres (Supabase is a fast way to get auth + DB + storage in one for MVP).
- **AI/LLM:** Anthropic API (Claude) for interview, itinerary generation, and rationale text. Use structured outputs (JSON mode via prompting) for anything that writes to the DB.
- **Scheduled jobs:** simple cron (e.g. Supabase Edge Functions, or a lightweight worker like BullMQ) for weekly itinerary generation and Discovery Agent runs.
- **Email/notifications:** Postmark or Resend for transactional + weekly digest emails.
- **Payments:** Stripe (subscriptions).
- **Hosting:** Vercel (frontend) + Supabase or Render (backend/DB).
- **Analytics:** PostHog (self-hostable, good for tracking accept/skip/booking funnels which you need for the Memory Agent anyway).

---

## 8. API Endpoints (high-level, MVP)

```
POST   /auth/signup
POST   /auth/login

POST   /onboarding/message        # conversational turn, returns AI reply + extracted profile delta
GET    /onboarding/summary        # profile summary for confirmation screen
PATCH  /profile                   # manual edits to profile

GET    /itinerary/current         # this week's plan
POST   /itinerary/:itemId/action  # accept | swap | skip
POST   /itinerary/:itemId/booked  # confirm booked yes/no

GET    /surprise-me/current
POST   /surprise-me/:id/respond   # accepted | dismissed

GET    /activities?lat&lng&radius&tags   # for admin/debug and swap-alternatives UI

POST   /subscription/checkout     # Stripe checkout session
POST   /subscription/webhook      # Stripe webhook handler

# Admin (internal only)
POST   /admin/activities
PATCH  /admin/activities/:id
```

---

## 9. Screen List (Website/App)

1. **Landing page** — "Your Next Chapter" positioning, sign-up CTA
2. **Sign up / login**
3. **Onboarding chat** — conversational interview
4. **Profile summary/confirm**
5. **Home / This Week** — the itinerary, card per day/item
6. **Item detail** — full info, Accept/Swap/Skip, Book button
7. **Swap alternatives** — shown when user taps Swap
8. **Surprise Me card**
9. **Account/Settings** — profile edits, radius, budget, subscription management
10. **Subscription/paywall** — Stripe checkout
11. (Phase 2) **Family invite & dashboard**
12. (Admin, separate internal app) **Activity curation, partner management**

---

## 10. Notifications & Comms

- **Weekly email**: "Your Perfect Week" — sent Sunday evening, mirrors the in-app itinerary.
- **Surprise Me email**: sent Friday.
- **Transactional**: booking confirmations, "did you book this?" follow-up (2 days after item date), subscription renewal/failure.
- Keep initial channel to email + in-app only. Add SMS/WhatsApp only if pilot users request it — some retirees prefer it, but it adds cost/complexity you don't need to validate the core loop.

---

## 11. Non-Functional Requirements

- **Privacy/GDPR:** all family-visibility and any health-adjacent data must be strictly opt-in, with clear per-field consent — build the `visibility_settings` JSON structure to be granular from day one even though Family Dashboard itself is Phase 2.
- **Accessibility:** target WCAG 2.1 AA — large tap targets, high-contrast mode, adjustable text size. This audience skews toward vision/dexterity considerations; it's also good practice generally.
- **Regulatory:** do not present insurance or financial products as comparisons/recommendations without FCA authorisation — MVP should stick to simple affiliate links to third-party comparison sites if this is included at all, and this is best deferred past MVP entirely.
- **Data retention:** keep `PreferenceSignal` and `onboarding_transcript` covered by a clear retention/deletion policy; give members a working "delete my account and data" flow from day one, not bolted on later.

---

## 12. Build Plan (6–8 weeks)

| Week | Milestone |
|---|---|
| 1 | Data model + auth + basic Next.js shell deployed |
| 2 | Onboarding chat flow (LLM interview → structured profile) |
| 3 | Activity database seeded (manual curation for pilot region) + Discovery Agent v1 (scheduled scraper for 2–3 sources) |
| 4 | Itinerary Agent v1 + Home/This Week screen + Accept/Swap/Skip |
| 5 | Surprise Me + booking referral flow + "did you book?" feedback loop |
| 6 | Stripe subscription/paywall + weekly email delivery |
| 7 | Memory Agent v1 (preference-weighted regeneration) + admin curation tool |
| 8 | Pilot launch with 50–200 users in 1–2 regions; instrument analytics on accept/skip/booking rates |

**Success metric for MVP:** weekly itinerary acceptance rate (% of items accepted, not skipped) trending upward over the pilot as the Memory Agent gets more signal, plus a target subscription conversion rate from the pilot cohort before greenlighting Phase 2 (family dashboard, real-time booking APIs, social matching, partner discounts).

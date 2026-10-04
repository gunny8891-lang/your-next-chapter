import type { OpportunityCandidate } from "@/lib/opportunities/engine";
import { foodKindOf, isFoodVenue, type FoodKind } from "@/lib/opportunities/kinds";
import { eventDate, weekdayOf } from "@/lib/opportunities/schedule";
import { scoreActivity, type AffinityScores } from "@/lib/memory/scoring";
import { haversineDistanceKm } from "@/lib/geo/haversine";
import { estimateDurationMinutes } from "@/lib/someTime/duration";
import { mealLabel, suitsMealTime, typicalSpend } from "@/lib/someTime/food";
import { openStatus } from "@/lib/someTime/openingHours";
import type { Mood, TimeRequest } from "@/lib/someTime/request";
import { estimateTravel, type TravelMode, type TravelProfile } from "@/lib/someTime/travel";
import { clockLabel, durationLabel, type TimeWindow } from "@/lib/someTime/window";
import { dailyStateAdjustment, type DailyState } from "@/lib/experience/dailyState";

/**
 * Everything that decides whether something is a good way to spend a given
 * stretch of time — in plain code, before any AI is involved. Claude is then
 * only asked to choose between candidates that already fit, and to explain why.
 */

export type MemberContext = {
  budget_band: "low" | "medium" | "high" | string | null;
  interests: string[];
  goals: string[];
  dietary: string | null;
  mobility_notes: string | null;
  travel: TravelProfile;
  home: { lat: number; lng: number } | null;
};

/** What the member has recently done, so the same thing is not suggested again and again. */
export type RepetitionHistory = {
  /** Done or enjoyed in roughly the last month. */
  recentActivityIds: Set<string>;
  /** How many items of each category were in their last week. */
  categoryCounts: Record<string, number>;
};

export const EMPTY_HISTORY: RepetitionHistory = { recentActivityIds: new Set(), categoryCounts: {} };

export type ScoringInput = {
  /** How they said they are today, if they did: adjusts today's ranking and nothing lasting. */
  dailyState?: DailyState | null;
  window: TimeWindow;
  request: TimeRequest;
  member: MemberContext;
  affinity: AffinityScores;
  history: RepetitionHistory;
  /** Dry and mild enough that being outdoors is a plus. */
  pleasantWeather: boolean;
  /** Today's sunrise and sunset in minutes after midnight, when known. Outdoor things are not offered in the dark. */
  daylight?: { sunriseMin: number; sunsetMin: number } | null;
};

export type Evaluated = {
  candidate: OpportunityCandidate;
  score: number;
  distanceKm: number | null;
  travelMinutes: number;
  travelMode: TravelMode;
  durationMinutes: number;
  /** When they would set off, arrive, and the activity ends / they would be home (minutes after midnight). */
  leaveMin: number;
  arriveMin: number;
  endMin: number;
  homeMin: number;
  /** Closing time in minutes after midnight, when known. */
  openUntil: number | null;
  /** For a one-off event, when it actually starts (minutes after midnight); null for anything else. */
  eventStartMin: number | null;
  /** Short factual lines for the card. */
  facts: string[];
  /** Why it scored well — the truthful basis for the explanation. */
  reasons: string[];
};

// ---- tuning -------------------------------------------------------------

const BUDGET_PER_PERSON: Record<string, number> = { low: 12, medium: 35, high: 90 };
/** Over this multiple of the budget it is not a stretch, it is out. */
const BUDGET_HARD_LIMIT = 2.5;
/** When the home location is unknown, assume this much travel. */
const UNKNOWN_DISTANCE_KM = 4;
/** An event is entered this long before it starts. */
const EVENT_EARLY_ARRIVAL_MIN = 10;

const GOAL_CATEGORIES: Record<string, string[]> = {
  fitness: ["Move", "Wellness"],
  learn_something_new: ["Learn", "Explore"],
  meet_people: ["Connect"],
  give_back: ["Give Back"],
};

const OUTDOOR_TAGS = ["outdoors", "walking", "nature", "gardens", "playground"];

/** How a goal reads in a sentence. Goals typed freely on the Account page are used as written. */
const GOAL_LABEL: Record<string, string> = {
  fitness: "staying active",
  learn_something_new: "learning something new",
  meet_people: "meeting new people",
  give_back: "giving back locally",
};

/** How a category reads in "you have enjoyed ___ lately". */
const CATEGORY_PHRASE: Record<string, string> = {
  Move: "active outings",
  Connect: "time with other people",
  Learn: "learning",
  Explore: "exploring",
  "Give Back": "giving back",
  Wellness: "looking after yourself",
  Joy: "simple pleasures",
};
const CULTURE_NAME = /\b(museum|gallery|theatre|theater|heritage|historic|history|exhibition|arts|cinema|concert|castle|stately)\b/i;
/** An outdoor visit needs at least this much daylight left after arriving (or the whole visit, if shorter). */
const DAYLIGHT_MIN_VISIT = 40;

/**
 * Places like museums and libraries keep daytime hours. When a source did not
 * record them (a web search rarely does) we assume the usual, rather than send
 * someone to a museum at seven in the evening.
 */
const ASSUMED_OPEN_MIN = 9 * 60 + 30;
const ASSUMED_LAST_ARRIVAL_MIN = 16 * 60 + 30;
function isDaytimeVenue(c: Pick<OpportunityCandidate, "tags" | "title">): boolean {
  return c.tags.some((t) => ["museum", "heritage", "books"].includes(t)) || /\b(museum|library|gallery|heritage)\b/i.test(c.title);
}

/**
 * The shortest sensible visit for things that can be cut down to fit — a quick
 * coffee, a stroll — or null for things that cannot (a film, a class, a museum
 * you would not rush round). Without this a 30-minute window rejects every café.
 */
export function minimumVisitMinutes(tags: string[]): number | null {
  const kind = foodKindOf(tags);
  if (kind === "cafe") return 20;
  if (kind === "pub") return 30;
  if (kind === "restaurant") return 40;
  if (kind === "tea_room") return 45;
  if (tags.some((t) => ["walking", "gardens", "nature"].includes(t))) return 20;
  if (tags.includes("books")) return 20;
  return null;
}

// ---- mood ---------------------------------------------------------------

/** How well something suits the mood the member picked (0 = no effect). */
export function moodBonus(mood: Mood | null, c: Pick<OpportunityCandidate, "category" | "tags"> & { title?: string }): number {
  const has = (...tags: string[]) => tags.some((t) => c.tags.includes(t));
  switch (mood) {
    case "outdoors":
      return (has("outdoors", "walking", "nature", "gardens") ? 3.5 : 0) + (c.category === "Move" ? 0.5 : 0) - (has("books", "cinema", "theatre", "museum") ? 1.5 : 0);
    case "active":
      return (["Move", "Wellness"].includes(c.category) ? 3 : 0) + (has("walking", "fitness", "swimming", "yoga") ? 1 : 0) - (has("books", "cinema") ? 1.5 : 0);
    case "social":
      return (c.category === "Connect" ? 3 : 0) + (has("social", "community", "classes", "pub", "restaurant", "cafe") ? 1.5 : 0);
    case "culture": {
      // What a place IS decides this, not its category: "Explore" also holds nature
      // reserves, and sources that tag loosely (a web search that files a museum
      // under Joy with no tags) still say what it is in the name.
      const cultural = has("museum", "history", "heritage", "arts", "theatre", "cinema", "books") || CULTURE_NAME.test(c.title ?? "");
      return (cultural ? 3.5 : 0) + (c.category === "Learn" ? 1 : 0) + (c.category === "Explore" && !has("nature") ? 1 : 0) - (has("nature") ? 1 : 0);
    }
    case "relaxed":
      return (c.category === "Wellness" ? 3 : 0) + (has("relaxation", "gardens", "quiet", "books", "afternoon-tea", "nature", "cafe") ? 2 : 0) - (c.category === "Move" && !has("walking") ? 1.5 : 0);
    case "food":
      return isFoodVenue(c) ? 4 : -4;
    default:
      return 0;
  }
}

function whoBonus(who: TimeRequest["who"], c: Pick<OpportunityCandidate, "tags">): number {
  const has = (...tags: string[]) => tags.some((t) => c.tags.includes(t));
  if (who === "partner") return has("theatre", "cinema", "gardens", "museum", "restaurant", "afternoon-tea", "cafe") ? 1 : 0;
  if (who === "friends") return has("social", "community", "pub", "restaurant", "cafe", "classes") ? 1 : 0;
  if (who === "family") return has("grandchildren") ? 1 : 0;
  return 0;
}

// ---- repetition ---------------------------------------------------------

export function repetitionPenalty(c: Pick<OpportunityCandidate, "id" | "category">, history: RepetitionHistory): number {
  let penalty = 0;
  if (history.recentActivityIds.has(c.id)) penalty += 6;
  const sameCategory = history.categoryCounts[c.category] ?? 0;
  if (sameCategory >= 3) penalty += 2;
  else if (sameCategory === 2) penalty += 1;
  return penalty;
}

// ---- budget -------------------------------------------------------------

function pricePerPerson(c: OpportunityCandidate, kind: FoodKind | null): number | null {
  if (c.price_estimate != null) return Number(c.price_estimate);
  return kind ? typicalSpend(kind) : null;
}

/** null = outside any reasonable stretch of the budget; otherwise a score adjustment (≤ 0.5). */
function budgetAdjustment(price: number | null, band: string | null): number | null {
  if (price == null || !band) return 0;
  const cap = BUDGET_PER_PERSON[band];
  if (!cap) return 0;
  if (price > cap * BUDGET_HARD_LIMIT) return null;
  if (price > cap) return -Math.min(3, ((price - cap) / cap) * 2);
  return price === 0 && band === "low" ? 0.5 : 0;
}

function priceFact(price: number | null, exact: boolean): string | null {
  if (price == null) return null;
  if (price === 0) return "Free";
  return exact ? `£${price}` : `about £${price} each`;
}

// ---- evaluation ---------------------------------------------------------

function distanceFromHome(c: OpportunityCandidate, home: MemberContext["home"]): number | null {
  if (!home || c.location_lat == null || c.location_lng == null) return null;
  return haversineDistanceKm(home.lat, home.lng, c.location_lat, c.location_lng);
}

/**
 * Scores one candidate for one request, or returns null if it simply cannot work:
 * it will not fit the time, is shut when they would arrive, is the wrong sort of
 * place for the time of day, or is far beyond their budget.
 */
export function evaluateCandidate(c: OpportunityCandidate, input: ScoringInput): Evaluated | null {
  const { window, request, member, affinity, history } = input;
  const weekday = weekdayOf(window.date);
  const kind = foodKindOf(c.tags);

  const km = distanceFromHome(c, member.home);
  const travel = estimateTravel(km ?? UNKNOWN_DISTANCE_KM, member.travel);

  // --- how long would it take? ---
  // Something that can be cut down is, if that is what makes it fit — but never
  // below its shortest sensible visit, and never an event, which has fixed hours.
  const event = eventDate(c);
  const fullDuration = estimateDurationMinutes(c);
  const minVisit = minimumVisitMinutes(c.tags);
  const durationMinutes =
    !event && minVisit != null
      ? Math.min(fullDuration, Math.max(minVisit, window.availableMinutes - 2 * travel.minutes))
      : fullDuration;

  // --- when would it happen? ---
  let arriveMin: number;
  let endMin: number;
  let eventStartMin: number | null = null;
  if (event) {
    if (event.date !== window.date) return null;
    const startsAt = new Date(c.date_time!).getUTCHours() * 60 + new Date(c.date_time!).getUTCMinutes();
    eventStartMin = startsAt;
    // They must be able to get there from the start of their free time.
    if (window.startMin + travel.minutes > startsAt) return null;
    arriveMin = startsAt - Math.min(EVENT_EARLY_ARRIVAL_MIN, startsAt - (window.startMin + travel.minutes));
    endMin = startsAt + durationMinutes;
  } else {
    arriveMin = window.startMin + travel.minutes;
    endMin = arriveMin + durationMinutes;
  }
  const homeMin = endMin + travel.minutes;
  if (homeMin > window.endMin) return null;
  const leaveMin = arriveMin - travel.minutes;

  // --- is it open, and does it suit the time of day? ---
  let openUntil: number | null = null;
  if (!event) {
    const status = openStatus(c.recurrence_rule, weekday, arriveMin, durationMinutes);
    if (status.status === "closed") return null;
    if (status.status === "open") openUntil = status.closesAt;
    if (status.status === "unknown" && isDaytimeVenue(c) && (arriveMin < ASSUMED_OPEN_MIN || arriveMin > ASSUMED_LAST_ARRIVAL_MIN)) return null;
  }
  if (kind && !suitsMealTime(kind, arriveMin)) return null;

  // --- will it be light? ---
  // A walk in a park at 6pm in October is a walk in the dark. Not offered if they
  // would arrive near or after sunset; marked down if the visit runs past it.
  const isOutdoor = c.tags.some((t) => OUTDOOR_TAGS.includes(t));
  const daylight = input.daylight ?? null;
  if (isOutdoor && daylight && (arriveMin < daylight.sunriseMin || arriveMin + Math.min(durationMinutes, DAYLIGHT_MIN_VISIT) > daylight.sunsetMin)) return null;
  const runsPastSunset = isOutdoor && daylight !== null && endMin > daylight.sunsetMin;

  // --- can they afford it? ---
  const price = pricePerPerson(c, kind);
  const budget = budgetAdjustment(price, member.budget_band);
  if (budget === null) return null;

  // --- how good is it for them? ---
  const reasons: string[] = [];
  let score = 0;

  const affinityScore = Math.max(-8, Math.min(12, scoreActivity(c, affinity)));
  score += affinityScore;
  if ((affinity.categoryScores[c.category] ?? 0) >= 2) reasons.push(`you have enjoyed ${CATEGORY_PHRASE[c.category] ?? c.category.toLowerCase()} lately`);

  const mood = moodBonus(request.mood, c);
  score += mood;
  if (mood >= 3 && request.mood) reasons.push(`it suits a ${request.mood === "culture" ? "cultural" : request.mood} mood`);

  const goalHit = member.goals.find((g) => GOAL_CATEGORIES[g]?.includes(c.category));
  if (goalHit) {
    score += 1.5;
    reasons.push(`it supports your goal of ${GOAL_LABEL[goalHit] ?? goalHit}`);
  }

  const interestHits = member.interests.filter((i) => {
    const needle = i.trim().toLowerCase();
    return needle && (c.tags.some((t) => t.toLowerCase() === needle) || c.title.toLowerCase().includes(needle));
  });
  if (interestHits.length) {
    score += Math.min(2, interestHits.length);
    reasons.push(`it matches your interest in ${interestHits[0]}`);
  }

  score += budget;
  score -= travel.minutes / 15;
  score += whoBonus(request.who, c);

  const total = homeMin - window.startMin;
  const fill = total / window.availableMinutes;
  if (!event && fill >= 0.5) score += 1;
  if (!event && total < window.minUsefulMinutes) score -= 2;

  if (input.pleasantWeather && c.tags.some((t) => OUTDOOR_TAGS.includes(t))) {
    score += 1;
    reasons.push("the weather suits being outdoors");
  }

  if (event) {
    score += request.mood === "food" ? 0 : 1.5;
    reasons.push("it is actually happening today");
  }

  if (runsPastSunset) score -= 1.5;

  const today = dailyStateAdjustment(input.dailyState ?? null, c, { durationMinutes, travelMinutes: travel.minutes });
  // Hours of exertion on a day they said they are taking it easy is not offered at all.
  if (today.exclude) return null;
  score += today.score;
  reasons.push(...today.reasons);

  score -= repetitionPenalty(c, history);
  if (c.tags.includes("chain")) score -= 1.5;

  const dietary = member.dietary?.toLowerCase() ?? "";
  if (kind) {
    if (/vegan/.test(dietary) && c.tags.includes("vegan-options")) score += 1.5;
    else if (/vegetarian/.test(dietary) && (c.tags.includes("vegetarian-options") || c.tags.includes("vegan-options"))) score += 1;
  }
  if (member.mobility_notes?.trim() && c.tags.includes("wheelchair-accessible")) score += 1;

  // --- the facts shown on the card ---
  const facts: string[] = [`${travel.minutes} min ${travel.mode === "walk" ? "walk" : "away"}`];
  facts.push(`about ${durationLabel(durationMinutes)}`);
  const cost = priceFact(price, c.price_estimate != null);
  if (cost) facts.push(cost);
  if (event) facts.push(`starts ${clockLabel(new Date(c.date_time!).getUTCHours() * 60 + new Date(c.date_time!).getUTCMinutes())}`);
  else if (openUntil != null) facts.push(`open until ${clockLabel(openUntil)}`);

  return {
    candidate: c,
    score,
    distanceKm: km,
    travelMinutes: travel.minutes,
    travelMode: travel.mode,
    durationMinutes,
    leaveMin,
    arriveMin,
    endMin,
    homeMin,
    openUntil,
    eventStartMin,
    facts,
    reasons,
  };
}

// ---- shortlist ----------------------------------------------------------

/**
 * Best-first, but never more than `perCategory` of one category and `maxFood`
 * food venues — so the three suggestions are genuinely different ways to spend
 * the time, not three similar things.
 */
export function diversify(evaluated: Evaluated[], size: number, perCategory = 2, maxFood = 2): Evaluated[] {
  const picked: Evaluated[] = [];
  const categoryCounts: Record<string, number> = {};
  let food = 0;
  for (const e of [...evaluated].sort((a, b) => b.score - a.score)) {
    if (picked.length >= size) break;
    const category = e.candidate.category;
    const isFood = isFoodVenue(e.candidate);
    if ((categoryCounts[category] ?? 0) >= perCategory && !isFood) continue;
    if (isFood && food >= maxFood) continue;
    // A café does not use up a place meant for, say, a theatre: food has its own cap.
    if (isFood) food += 1;
    else categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    picked.push(e);
  }
  return picked;
}

// ---- food stops ---------------------------------------------------------

export type FoodStop = {
  candidate: OpportunityCandidate;
  distanceMeters: number;
  walkMinutes: number;
  arriveMin: number;
  /** When they would finish there, and be home. */
  endMin: number;
  homeMin: number;
  meal: string;
  openUntil: number | null;
};

/** Cafés/pubs this close to where they will be count as "nearby". */
const FOOD_STOP_RADIUS_KM = 1.5;
const MIN_FOOD_STOP_MINUTES = 30;
/** The longest walk from the main thing to a place to eat that still counts as "nearby". */
const MAX_FOOD_WALK_MIN = 15;

/**
 * The best café, pub, restaurant or tea room to finish at, near where they will
 * be and for the time of day — or null if there is no time for one, or nothing
 * suitable is open nearby. Never a second stop if the main thing is itself food.
 */
export function findFoodStop(main: Evaluated, foodVenues: OpportunityCandidate[], input: ScoringInput): FoodStop | null {
  const { window, member, affinity } = input;
  if (isFoodVenue(main.candidate)) return null;
  if (main.candidate.location_lat == null || main.candidate.location_lng == null) return null;
  const weekday = weekdayOf(window.date);

  let best: { stop: FoodStop; score: number } | null = null;
  for (const venue of foodVenues) {
    if (venue.id === main.candidate.id || venue.location_lat == null || venue.location_lng == null) continue;
    const kind = foodKindOf(venue.tags);
    if (!kind) continue;

    const km = haversineDistanceKm(main.candidate.location_lat, main.candidate.location_lng, venue.location_lat, venue.location_lng);
    if (km > FOOD_STOP_RADIUS_KM) continue;

    // "Nearby" means a short walk on from where they are, not a second journey.
    const walk = estimateTravel(km, member.travel);
    if (walk.mode !== "walk" || walk.minutes > MAX_FOOD_WALK_MIN) continue;

    const arriveMin = main.endMin + walk.minutes;
    const homeKm = member.home ? haversineDistanceKm(member.home.lat, member.home.lng, venue.location_lat, venue.location_lng) : UNKNOWN_DISTANCE_KM;
    const homeTravel = estimateTravel(homeKm, member.travel).minutes;
    // A stop is cut down to fit the time that is left, but not below a sensible visit.
    const fullStay = estimateDurationMinutes(venue);
    const room = window.endMin - arriveMin - homeTravel;
    const stay = Math.min(fullStay, Math.max(minimumVisitMinutes(venue.tags) ?? fullStay, room));
    const homeMin = arriveMin + stay + homeTravel;
    if (homeMin > window.endMin || stay < MIN_FOOD_STOP_MINUTES) continue;
    if (!suitsMealTime(kind, arriveMin)) continue;

    const status = openStatus(venue.recurrence_rule, weekday, arriveMin, stay);
    if (status.status === "closed") continue;

    const budget = budgetAdjustment(pricePerPerson(venue, kind), member.budget_band);
    if (budget === null) continue;

    // Closer, independent, well-described and liked-before venues win.
    let score = budget - km * 2 + Math.max(-3, Math.min(3, scoreActivity(venue, affinity)) / 2);
    if (venue.tags.includes("chain")) score -= 1.5;
    if (venue.recurrence_rule) score += 0.3;
    if (/vegan/i.test(member.dietary ?? "") && venue.tags.includes("vegan-options")) score += 1.5;
    else if (/vegetarian/i.test(member.dietary ?? "") && (venue.tags.includes("vegetarian-options") || venue.tags.includes("vegan-options"))) score += 1;

    if (!best || score > best.score) {
      best = {
        score,
        stop: {
          candidate: venue,
          distanceMeters: Math.round(km * 1000),
          walkMinutes: walk.minutes,
          arriveMin,
          endMin: arriveMin + stay,
          homeMin,
          meal: mealLabel(kind, arriveMin),
          openUntil: status.status === "open" ? status.closesAt : null,
        },
      };
    }
  }
  return best?.stop ?? null;
}

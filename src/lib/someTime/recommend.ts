import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryName } from "@/lib/categories";
import { callClaude } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";
import { summarizeAffinity, type AffinityScores } from "@/lib/memory/scoring";
import { fetchRankedOpportunities, type OpportunityCandidate } from "@/lib/opportunities/engine";
import { foodKindOf, isFoodVenue, isPerformanceVenue } from "@/lib/opportunities/kinds";
import { humanReason } from "@/lib/someTime/copy";
import { settingOf } from "@/lib/someTime/format";
import { buildPlan, estimateCost, fallbackExperienceTitle, titleFitsPlan } from "@/lib/someTime/experience";
import { eventDate, weekStartFor } from "@/lib/opportunities/schedule";
import { getDailyForecast, isStrongOutdoorWeather, type DayForecast } from "@/lib/nudges/weather";
import { applyOpenTimeContext } from "@/lib/surprise/context";
import { loadRepetitionHistory } from "@/lib/someTime/history";
import {
  buildUserPrompt,
  fallbackWhy,
  MAX_OPTIONS,
  parseChoices,
  SYSTEM_PROMPT,
  type PromptContext,
  type ShortlistEntry,
} from "@/lib/someTime/prompt";
import { fallbackImageFor } from "@/lib/imagery/fallback";
import { attachImages } from "@/lib/someTime/images";
import type { TimeRequest } from "@/lib/someTime/request";
import { requestWithDailyState, type DailyState } from "@/lib/experience/dailyState";
import { loadDailyState } from "@/lib/experience/dailyStateStore";
import {
  diversify,
  evaluateCandidate,
  findFoodStop,
  moodFits,
  type Evaluated,
  type FoodStop,
  type MemberContext,
  type RepetitionHistory,
  type ScoringInput,
} from "@/lib/someTime/score";
import type { FoodStopOption, TimeOption, TimeResult } from "@/lib/someTime/types";
import { clockLabel, resolveWindow, type TimeWindow } from "@/lib/someTime/window";
import type { Mood } from "@/lib/someTime/request";

/** How many scored candidates the model sees. Enough for variety, small enough to keep the call cheap. */
const SHORTLIST_SIZE = 8;
// Three short explanations need well under 1,000 tokens, but one real reply
// reached 1,200 and was cut off mid-JSON. Headroom costs nothing: it is only
// ever paid for if used.
const MAX_TOKENS = 2000;
const MODEL = AI_MODELS.smart;

const KIND_LABEL = { cafe: "café", pub: "pub", restaurant: "restaurant", tea_room: "tea room" } as const;

/** Writes the choice given the shortlist; injectable so the rest can be tested without a model. */
export type Ask = (system: string, user: string) => Promise<string>;

export type RecommendInputs = {
  request: TimeRequest;
  window: TimeWindow;
  /** Already narrowed for the day, the weather and who they are with (see applyOpenTimeContext). */
  candidates: OpportunityCandidate[];
  weatherNote: string | null;
  pleasantWeather: boolean;
  /** Today's sunrise and sunset, so nothing outdoors is offered in the dark. */
  daylight?: ScoringInput["daylight"];
  member: MemberContext;
  affinity: AffinityScores;
  history: RepetitionHistory;
  /** How they said they are today, if they did. */
  dailyState?: DailyState | null;
  profile: PromptContext["profile"];
  aspirations: string[];
  /** null = no model: use the scored fallback directly (instant, free — for the Today hero). */
  ask: Ask | null;
};

/**
 * What can be the main suggestion. Cafés and pubs are normally only a way to end
 * an outing, so they are offered on their own only when that is what was asked
 * for (food mood), when there is barely time for anything else, or — for a café
 * or tea room — when the mood is relaxed.
 */
function primaryPool(candidates: OpportunityCandidate[], request: TimeRequest, window: TimeWindow): OpportunityCandidate[] {
  if (request.mood === "food") return candidates.filter(isFoodVenue);
  return candidates.filter((c) => {
    // A volunteering role is something you sign up to, not something to drop into
    // for an hour. It belongs in the weekly plan, not in "I have some time now".
    if (c.category === "Give Back" && eventDate(c) === null) return false;
    if (!isFoodVenue(c)) return true;
    const kind = foodKindOf(c.tags);
    return window.availableMinutes <= 45 || (request.mood === "relaxed" && (kind === "cafe" || kind === "tea_room"));
  });
}

function toFoodStopOption(stop: FoodStop): FoodStopOption {
  const kind = foodKindOf(stop.candidate.tags);
  return {
    id: stop.candidate.id,
    title: stop.candidate.title,
    address: stop.candidate.address,
    kind: kind ? KIND_LABEL[kind] : "place to eat",
    meal: stop.meal,
    walkMinutes: stop.walkMinutes,
    distanceMeters: stop.distanceMeters,
    openUntil: stop.openUntil != null ? clockLabel(stop.openUntil) : null,
    bookingUrl: stop.candidate.booking_url,
  };
}

function toTimeOption(entry: ShortlistEntry, why: string, includeFood: boolean, modelTitle: string | null = null): TimeOption {
  const { evaluated: e, foodStop } = entry;
  const c = e.candidate;
  const stop = includeFood ? foodStop : null;
  const plan = buildPlan(e, stop);
  // A theatre or cinema with no show listed is a place to check, not a promised performance.
  const checkWhatsOn = isPerformanceVenue(c) && e.eventStartMin === null;
  // The model's name for the outing, if it is honest about the plan; otherwise one built from the facts.
  const experienceTitle =
    modelTitle && titleFitsPlan(modelTitle, stop !== null, isFoodVenue(c), checkWhatsOn) ? modelTitle : fallbackExperienceTitle(e, stop);
  return {
    id: c.id,
    title: c.title,
    experienceTitle,
    estimatedCost: estimateCost(e, stop),
    stops: plan.stops,
    legs: plan.legs,
    category: c.category as CategoryName,
    address: c.address,
    priceEstimate: c.price_estimate,
    bookingUrl: c.booking_url,
    why,
    reason: humanReason(e.reasons),
    setting: settingOf(c.tags),
    facts: e.facts,
    leaveBy: clockLabel(e.leaveMin),
    arriveBy: clockLabel(e.arriveMin),
    homeBy: clockLabel(stop ? stop.homeMin : e.homeMin),
    durationMinutes: e.durationMinutes,
    travelMinutes: e.travelMinutes,
    isFood: isFoodVenue(c),
    happeningToday: eventDate(c) !== null,
    checkWhatsOn,
    foodStop: stop ? toFoodStopOption(stop) : null,
    // A calm stand-in by kind of activity; a real photograph replaces it afterwards (see attachImages).
    image: fallbackImageFor(c.tags),
  };
}

/**
 * The pure core: score everything, shortlist a varied handful, attach a food stop
 * where one fits, and let the model choose and explain — falling back to the best
 * scored candidates with an explanation built from real facts if it cannot.
 */
export async function buildRecommendations(inputs: RecommendInputs): Promise<{ options: TimeOption[]; notice: string | null }> {
  const { window, member, affinity, history } = inputs;
  const dailyState = inputs.dailyState ?? null;
  // What they feel like today stands in for a mood they did not choose for this request.
  const request = requestWithDailyState(inputs.request, dailyState);
  const scoring: ScoringInput = { window, request, member, affinity, history, pleasantWeather: inputs.pleasantWeather, daylight: inputs.daylight, dailyState };

  // A mood they CHOSE for this request is a requirement, not a nudge: an idea that does not fit it is left out. (A
  // mood that only comes from how they said they feel today stays a gentle preference, so Today is never left bare.)
  const chosenMood = inputs.request.mood;
  const foodVenues = inputs.candidates.filter(isFoodVenue);
  const evaluated = primaryPool(inputs.candidates, request, window)
    .filter((c) => moodFits(chosenMood, c))
    .map((c) => evaluateCandidate(c, scoring))
    .filter((e): e is Evaluated => e !== null);

  const shortlist: ShortlistEntry[] = diversify(evaluated, SHORTLIST_SIZE).map((e) => ({
    evaluated: e,
    foodStop: request.mood === "food" ? null : findFoodStop(e, foodVenues, scoring),
  }));

  if (shortlist.length === 0) {
    return {
      options: [],
      notice: moodNotice(chosenMood, 0) ?? "Nothing nearby fits that stretch of time right now. Try a little longer, or a different mood.",
    };
  }
  // With a chosen mood and fewer ideas than usual, say so plainly rather than let it look like a mistake.
  const notice = moodNotice(chosenMood, shortlist.length);

  const byId = new Map(shortlist.map((s) => [s.evaluated.candidate.id, s]));
  const idsWithFood = new Set(shortlist.filter((s) => s.foodStop).map((s) => s.evaluated.candidate.id));

  const promptContext: PromptContext = {
    window,
    weekdayLabel: new Date(`${window.date}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }),
    request,
    weatherNote: inputs.weatherNote,
    profile: inputs.profile,
    aspirations: inputs.aspirations,
    affinitySummary: summarizeAffinity(affinity),
    dailyState,
  };

  if (inputs.ask) try {
    const reply = await inputs.ask(SYSTEM_PROMPT, buildUserPrompt(promptContext, shortlist));
    const choices = parseChoices(reply, new Set(byId.keys()), idsWithFood);
    if (choices.length > 0) {
      return { options: choices.map((ch) => toTimeOption(byId.get(ch.id)!, ch.why, ch.withFood, ch.title)), notice };
    }
    console.warn("some_time: the model's reply had no usable options; using the scored fallback");
  } catch (err) {
    // A model hiccup should still leave the member with good suggestions — but
    // never silently: this is what would otherwise hide a degraded experience.
    console.warn("some_time: model call failed; using the scored fallback:", err instanceof Error ? err.message : err);
  }

  const options = shortlist
    .slice(0, MAX_OPTIONS)
    .map((s) => toTimeOption(s, fallbackWhy(s.evaluated), s.foodStop !== null && window.availableMinutes >= 90));
  return { options, notice };
}

const MOOD_WORD: Partial<Record<Mood, string>> = { outdoors: "outdoors", active: "active", social: "sociable", culture: "cultural", relaxed: "relaxed", food: "food" };

/** The honest line for a chosen mood that little nearby fits; null when there is plenty, or no mood was chosen. */
export function moodNotice(mood: Mood | null, fitting: number): string | null {
  const word = mood ? MOOD_WORD[mood] : undefined;
  if (!word) return null;
  const a = /^[aeiou]/i.test(word) ? "an" : "a";
  if (fitting === 0) return `Nothing nearby suits ${a} ${word} mood just now. Try "Surprise me", or a different mood.`;
  if (fitting < MAX_OPTIONS) return `That's everything nearby that suits ${a} ${word} mood right now. "Surprise me" will show more.`;
  return null;
}

// ---------------------------------------------------------------------------

function weekdayDateLabel(window: TimeWindow): string {
  const date = new Date(`${window.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${date}, ${clockLabel(window.startMin)} – ${clockLabel(window.endMin)}`;
}

function defaultAsk(supabase: SupabaseClient, memberId: string): Ask {
  return async (system, user) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const response = await callClaude(new Anthropic({ apiKey }), supabase, { userId: memberId, feature: "some_time" }, {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    // A reply cut off mid-JSON is a failure, not an answer: say so, so it shows up
    // in logs instead of silently becoming the fallback text.
    if (response.stop_reason === "max_tokens") throw new Error("some_time reply was truncated at max_tokens");
    return response.content.find((block) => block.type === "text")?.text ?? "";
  };
}

/**
 * "I've got some time": loads what we know about the member and the day, then
 * hands it to buildRecommendations. Everything the member's profile already
 * says is used rather than asked again.
 */
export async function getTimeOptions(
  supabase: SupabaseClient,
  memberId: string,
  request: TimeRequest,
  now: Date = new Date(),
  ask: Ask | null = defaultAsk(supabase, memberId)
): Promise<TimeResult> {
  const resolved = resolveWindow(request, now);
  if (!resolved.ok) return { error: null, notice: resolved.reason, options: [], windowLabel: null };
  const { window } = resolved;

  const { data: profile } = await supabase
    .from("member_profiles")
    .select(
      "location_lat, location_lng, budget_band, interests, goals, dietary_preferences, mobility_notes, drives, uses_public_transport, personality"
    )
    .eq("user_id", memberId)
    .maybeSingle();

  // Don't suggest something already on this week's plan, or already shown this sitting.
  const { data: plan } = await supabase
    .from("itineraries")
    .select("itinerary_items(activity_id)")
    .eq("member_id", memberId)
    .eq("week_start_date", weekStartFor(window.date))
    .maybeSingle();
  const exclude = new Set<string>([
    ...((plan?.itinerary_items ?? []) as { activity_id: string }[]).map((i) => i.activity_id),
    ...request.exclude,
  ]);

  const hasHome = profile?.location_lat != null && profile?.location_lng != null;
  const [{ candidates: ranked, affinity }, forecast, history, goalRows, dailyState] = await Promise.all([
    fetchRankedOpportunities(supabase, memberId, { excludeActivityIds: exclude, foodVenues: "include" }),
    hasHome ? getDailyForecast(profile!.location_lat, profile!.location_lng, 2) : Promise.resolve(null as DayForecast[] | null),
    loadRepetitionHistory(supabase, memberId, window.date),
    supabase.from("goals").select("text").eq("member_id", memberId).eq("status", "active"),
    loadDailyState(supabase, memberId, window.date),
  ]);

  const { candidates, weatherNote } = applyOpenTimeContext(ranked, {
    when: "today",
    who: request.who,
    slot: null,
    today: window.date,
    forecast,
  });
  const todayForecast = forecast?.find((d) => d.date === window.date) ?? null;

  const member: MemberContext = {
    budget_band: profile?.budget_band ?? null,
    interests: profile?.interests ?? [],
    goals: profile?.goals ?? [],
    dietary: profile?.dietary_preferences ?? null,
    mobility_notes: profile?.mobility_notes ?? null,
    travel: {
      drives: profile?.drives ?? null,
      uses_public_transport: profile?.uses_public_transport ?? null,
      mobility_notes: profile?.mobility_notes ?? null,
    },
    home: hasHome ? { lat: profile!.location_lat, lng: profile!.location_lng } : null,
  };

  const { options, notice } = await buildRecommendations({
    request,
    window,
    candidates,
    weatherNote,
    pleasantWeather: todayForecast ? isStrongOutdoorWeather(todayForecast) : false,
    daylight:
      todayForecast?.sunriseMin != null && todayForecast?.sunsetMin != null
        ? { sunriseMin: todayForecast.sunriseMin, sunsetMin: todayForecast.sunsetMin }
        : null,
    member,
    affinity,
    history,
    dailyState,
    profile: {
      goals: member.goals,
      interests: member.interests,
      budget_band: member.budget_band,
      dietary: member.dietary,
      mobility_notes: member.mobility_notes,
      personality: (profile?.personality as { free_time_pref?: string } | null)?.free_time_pref ?? null,
    },
    aspirations: ((goalRows.data ?? []) as { text: string }[]).map((g) => g.text),
    ask,
  });

  return { error: null, notice, options: await attachImages(supabase, options), windowLabel: weekdayDateLabel(window) };
}

/**
 * The single best idea for the rest of today, for the top of the Today screen.
 *
 * It runs the same scoring and filtering as "I've got some time" but never calls
 * the model: Today has to load instantly and cost nothing every time it is
 * opened, so the explanation comes from facts we already hold. Null when nothing
 * fits (late in the evening, or nothing nearby).
 */
export async function getFeaturedOption(supabase: SupabaseClient, memberId: string, now: Date = new Date()): Promise<TimeOption | null> {
  const result = await getTimeOptions(
    supabase,
    memberId,
    { start: "now", duration: "half_day", who: "just_me", mood: null, exclude: [] },
    now,
    null
  );
  return result.options[0] ?? null;
}

import type { CategoryName } from "@/lib/categories";
import type { PlaceImage } from "@/lib/imagery/types";

/** A café, pub, restaurant or tea room to finish at. */
export type FoodStopOption = {
  id: string;
  title: string;
  address: string | null;
  /** "café", "pub", "restaurant" or "tea room". */
  kind: string;
  /** What it would be, in words: "lunch", "afternoon tea", "coffee and cake"… */
  meal: string;
  walkMinutes: number;
  distanceMeters: number;
  openUntil: string | null;
  bookingUrl: string | null;
};

/** One stop in an outing: when, where, and a line about it. */
export type PlanStop = {
  /** "HH:MM" — when to be there (for an event, when it starts). */
  time: string;
  title: string;
  /** The neighbourhood, when we know it. */
  subtitle: string | null;
  /** A short line: how long, when it closes, what it is. */
  note: string | null;
  kind: "place" | "food";
  category: CategoryName;
  /** A link for more information, kept secondary. */
  url: string | null;
};

/** The travel between one stop and the next. */
export type PlanLeg = { minutes: number; mode: "walk" };

/** One recommended way to spend the time. Plain data, safe to send to the browser. */
export type TimeOption = {
  id: string;
  /** The place itself, as named. */
  title: string;
  /** A name for the whole outing: "A walk, then coffee and cake in High Barnet". */
  experienceTitle: string;
  category: CategoryName;
  address: string | null;
  priceEstimate: number | null;
  bookingUrl: string | null;
  /** The explanation shown to the member. */
  why: string;
  /** Just the personal reason in a natural sentence (empty if there is none), for cards that carry the practicalities separately. */
  reason: string;
  /** Whether it is mostly outdoors or indoors, when we can tell. */
  setting: "outdoors" | "indoors" | null;
  /** Short checkable lines: travel, length, price, opening time. */
  facts: string[];
  /** "HH:MM" */
  leaveBy: string;
  arriveBy: string;
  homeBy: string;
  durationMinutes: number;
  travelMinutes: number;
  /** The suggestion is itself a place to eat or drink. */
  isFood: boolean;
  /** A one-off event actually on today, as opposed to a place or an ongoing thing. */
  happeningToday: boolean;
  foodStop: FoodStopOption | null;
  /** Roughly what it costs per person, from what we know; null when we know nothing about price. */
  estimatedCost: number | null;
  /** The stops in order, and the travel between them (legs.length === stops.length - 1). */
  stops: PlanStop[];
  legs: PlanLeg[];
  /** A photograph of the place (or the place to eat that ends the outing), when we have one. */
  image: PlaceImage | null;
};

export type TimeResult = {
  error: string | null;
  /** A plain-English explanation when there is nothing to show (or less than hoped). */
  notice: string | null;
  options: TimeOption[];
  /** "Fri 2 Oct, 13:10 – 15:10" */
  windowLabel: string | null;
};

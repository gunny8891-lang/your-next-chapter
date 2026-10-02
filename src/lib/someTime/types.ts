import type { CategoryName } from "@/lib/categories";

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

/** One recommended way to spend the time. Plain data, safe to send to the browser. */
export type TimeOption = {
  id: string;
  title: string;
  category: CategoryName;
  address: string | null;
  priceEstimate: number | null;
  bookingUrl: string | null;
  /** The explanation shown to the member. */
  why: string;
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
};

export type TimeResult = {
  error: string | null;
  /** A plain-English explanation when there is nothing to show (or less than hoped). */
  notice: string | null;
  options: TimeOption[];
  /** "Fri 2 Oct, 13:10 – 15:10" */
  windowLabel: string | null;
};

/**
 * What can be done with an outing once someone likes it, as plain data (links and a message) that a card or a sheet
 * shows: how to get there, a file for their calendar, and a message for a friend. Built on the server from what the
 * catalogue holds, so the browser is only ever given finished links. Pure.
 */

import { directionsUrl } from "@/lib/act/directions";
import { shareMessage, longDate } from "@/lib/act/share";
import type { TravelMode } from "@/lib/someTime/travel";

export type ActLinks = {
  /** Opens the phone's maps at the place, or null when we do not know where it is. */
  directions: string | null;
  /** A calendar file for the outing, or null when it cannot be placed on a day. */
  calendar: string | null;
  /** For the phone's share menu. */
  share: { title: string; text: string };
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar file for an idea made for a particular day and time, or null if anything is not valid. */
export function ideaCalendarUrl(args: { activityId: string; date: string; start: string; end: string; foodId?: string | null }): string | null {
  if (!DATE.test(args.date) || !CLOCK.test(args.start) || !CLOCK.test(args.end) || args.end <= args.start) return null;
  const params = new URLSearchParams({ activity: args.activityId, date: args.date, start: args.start, end: args.end });
  if (args.foodId) params.set("food", args.foodId);
  return `/api/calendar/file?${params.toString()}`;
}

/** The calendar file for something already in the plan. */
export function itemCalendarUrl(itemId: string): string {
  return `/api/calendar/file?${new URLSearchParams({ item: itemId }).toString()}`;
}

export function ideaActLinks(args: {
  activityId: string;
  experienceTitle: string;
  placeTitle: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mode: TravelMode | null;
  date: string;
  start: string;
  end: string;
  foodId: string | null;
  moreUrl: string | null;
}): ActLinks {
  return {
    directions: directionsUrl({ lat: args.lat, lng: args.lng }, args.mode),
    calendar: ideaCalendarUrl({ activityId: args.activityId, date: args.date, start: args.start, end: args.end, foodId: args.foodId }),
    share: shareMessage({ title: args.experienceTitle, when: longDate(args.date), at: args.start, place: args.placeTitle, address: args.address, moreUrl: args.moreUrl }),
  };
}

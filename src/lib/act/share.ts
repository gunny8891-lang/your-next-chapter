/**
 * "Send to a friend": a short plain message about one outing, for the phone's own share menu (messages, WhatsApp, email).
 * It says what, when and where, and where to read more. It never says anything about the person sending it, and it is built
 * only from what is already on the card. Pure.
 */

export const SITE_URL = "https://www.larkhour.com";

/** A link worth giving someone: not the openstreetmap listing, which is only where we found the place. */
export function worthSharing(url: string | null | undefined): string | null {
  return url && !/openstreetmap.org/i.test(url) ? url : null;
}
const MAX_LENGTH = 600;

/** "Saturday 10 October" for a calendar date. */
export function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export type ShareInput = {
  title: string;
  /** "Saturday 10 October", or "Saturday morning" for a plan with no exact time. */
  when?: string | null;
  /** "11:00", when there is a start time worth giving. */
  at?: string | null;
  place?: string | null;
  address?: string | null;
  moreUrl?: string | null;
};

export function shareMessage(input: ShareInput): { title: string; text: string } {
  const when = [input.when, input.at ? `from ${input.at}` : null].filter(Boolean).join(", ");
  // The place and its address, unless the address is only the place said again.
  const address = input.address && !(input.place && input.place.toLowerCase().includes(input.address.toLowerCase())) ? input.address : null;
  const where = [input.place, address].filter(Boolean).join(", ");
  const lines = [
    input.title,
    when ? when : null,
    where ? `At ${where}` : null,
    input.moreUrl ? `More: ${input.moreUrl}` : null,
    `Found with Lark Hour: ${SITE_URL}`,
  ].filter((l): l is string => Boolean(l));
  const text = lines.join("\n");
  return { title: input.title, text: text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text };
}

/** What a plan item holds when the price or the place is not known. Screens leave these out rather than show them as facts. */
export const PRICE_UNKNOWN = "Price TBC";
export const LOCATION_UNKNOWN = "Location TBC";

export function isUnknownDetail(text: string | null | undefined): boolean {
  return text === PRICE_UNKNOWN || text === LOCATION_UNKNOWN;
}

export function formatCost(price: number | null): string {
  if (price === null) return PRICE_UNKNOWN;
  if (price === 0) return "Free";
  return `£${price}`;
}

export function formatTime(dateTime: string | null, slot: string): string {
  if (!dateTime) return slot.charAt(0).toUpperCase() + slot.slice(1);
  return new Date(dateTime).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

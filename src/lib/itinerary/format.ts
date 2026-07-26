export function formatCost(price: number | null): string {
  if (price === null) return "Price TBC";
  if (price === 0) return "Free";
  return `£${price}`;
}

export function formatTime(dateTime: string | null, slot: string): string {
  if (!dateTime) return slot.charAt(0).toUpperCase() + slot.slice(1);
  return new Date(dateTime).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

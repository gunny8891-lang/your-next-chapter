import type { CategoryName } from "@/lib/categories";
import type { ItemDetails } from "@/lib/itinerary/details";
import type { PlaceImage } from "@/lib/imagery/types";
import type { ActLinks } from "@/lib/act/links";

export type MemberAction = "pending" | "accepted" | "swapped" | "skipped";

export type ItineraryItemView = {
  id: string;
  title: string;
  category: CategoryName;
  time: string;
  location: string;
  cost: string;
  why: string;
  day: string;
  status: MemberAction;
  bookingUrl: string | null;
  behaviorNote?: string | null;
  /** What it is, when it is open, how long, how far, how to find out more: from the catalogue, for the outing's sheet. */
  details?: ItemDetails | null;
  /** A photograph of the place, or a calm stand-in for the kind of thing it is, for the top of the outing's sheet. */
  image?: PlaceImage | null;
  /** How to get there, a file for their calendar, and a message for a friend. */
  act?: ActLinks | null;
};

export type SwapAlternative = {
  id: string;
  title: string;
  category: CategoryName;
  address: string | null;
  priceEstimate: number | null;
  tags: string[];
};

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type SurpriseView = {
  id: string;
  title: string;
  category: CategoryName;
  time: string;
  location: string;
  cost: string;
  why: string;
  bookingUrl: string | null;
  response: "accepted" | "dismissed" | null;
} | null;

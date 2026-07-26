import type { CategoryName } from "@/lib/categories";

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
};

export type SwapAlternative = {
  id: string;
  title: string;
  category: CategoryName;
  address: string | null;
  priceEstimate: number | null;
  tags: string[];
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

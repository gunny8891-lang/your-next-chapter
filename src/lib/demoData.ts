import type { ItineraryItemView, SurpriseView } from "@/lib/types";

// Shown when a member has no real itinerary yet (the Itinerary Agent isn't wired up
// in this scaffold) so the This Week screen isn't empty on first login.
export const DEMO_ITEMS: ItineraryItemView[] = [
  { id: "demo-1", day: "Mon", title: "Riverside Walking Group", category: "Move", time: "9:00am", location: "Richmond Lock, 0.8mi", cost: "Free", why: "You said mornings suit you best, and you've enjoyed two walking groups this month.", status: "pending", bookingUrl: null },
  { id: "demo-2", day: "Tue", title: "Coffee with Margaret & John", category: "Connect", time: "11:00am", location: "The Brew House, 1.2mi", cost: "~£6", why: "Margaret's group has similar interests in local history and gardening.", status: "pending", bookingUrl: null },
  { id: "demo-3", day: "Wed", title: "Watercolour Taster Session", category: "Learn", time: "2:00pm", location: "Community Hall, 2.1mi", cost: "£8", why: "You mentioned wanting to pick up a new creative hobby this year.", status: "pending", bookingUrl: null },
  { id: "demo-4", day: "Thu", title: "Ham House & Gardens", category: "Explore", time: "10:30am", location: "National Trust, 3.4mi", cost: "£14.50 (member: free)", why: "Sunny forecast, and you've rated National Trust visits highly before.", status: "pending", bookingUrl: null },
  { id: "demo-5", day: "Fri", title: "Reading Volunteer — St. Mary's Primary", category: "Give Back", time: "9:30am", location: "St. Mary's, 1.5mi", cost: "Free", why: "You told us giving back to the local community was a goal for this year.", status: "pending", bookingUrl: null },
  { id: "demo-6", day: "Sat", title: "Gentle Yoga for Flexibility", category: "Wellness", time: "10:00am", location: "Riverside Studio, 0.9mi", cost: "£5", why: "A lighter day, balanced against Thursday's longer outing.", status: "pending", bookingUrl: null },
  { id: "demo-7", day: "Sun", title: "Afternoon Tea at The Orangery", category: "Joy", time: "3:00pm", location: "Kew Gardens, 3.0mi", cost: "£24", why: "A relaxed close to the week — you've flagged Sunday as your favourite treat day.", status: "pending", bookingUrl: null },
];

export const DEMO_SURPRISE: SurpriseView = {
  id: "demo-surprise",
  title: "A Steam Railway & Sculpture Walk",
  category: "Explore",
  location: "Bluebell Railway + Sheffield Park, 22mi",
  time: "Tue, all day",
  cost: "£31 total",
  why: "You've never been on a steam railway, but you rated the National Trust wildlife trip 5 stars — this pairs a scenic ride with a gardens walk you haven't tried.",
  bookingUrl: null,
  response: null,
};

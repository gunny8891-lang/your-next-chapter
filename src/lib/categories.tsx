import {
  Footprints, Users, BookOpen, Compass, HeartHandshake, HeartPulse, Sparkles,
} from "lucide-react";
import { CATEGORY_COLOR } from "@/lib/theme";

export const CATEGORY = {
  Move: { icon: Footprints, color: CATEGORY_COLOR.Move },
  Connect: { icon: Users, color: CATEGORY_COLOR.Connect },
  Learn: { icon: BookOpen, color: CATEGORY_COLOR.Learn },
  Explore: { icon: Compass, color: CATEGORY_COLOR.Explore },
  "Give Back": { icon: HeartHandshake, color: CATEGORY_COLOR["Give Back"] },
  Wellness: { icon: HeartPulse, color: CATEGORY_COLOR.Wellness },
  Joy: { icon: Sparkles, color: CATEGORY_COLOR.Joy },
} as const;

export type CategoryName = keyof typeof CATEGORY;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type DayName = (typeof DAYS)[number];

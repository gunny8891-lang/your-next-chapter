import type { ExpectedVenue } from "@/lib/discovery/coverageReport";

/**
 * Towns used to check that discovery is working, each with venues known to exist there. The coverage report compares what
 * is stored with this list and says which are missing. It is a yardstick only: nothing here is recommended to anyone, and
 * the discovery engine does not read it. Adding a town means adding it here, not changing the engine.
 */
export type ValidationRegion = {
  label: string;
  lat: number;
  lng: number;
  expectedVenues: ExpectedVenue[];
};

export const VALIDATION_REGIONS: ValidationRegion[] = [
  {
    label: "Stevenage",
    lat: 51.9017,
    lng: -0.2027,
    expectedVenues: [
      { name: "Gravity Active" },
      { name: "360 Play" },
      { name: "Hollywood Bowl" },
      { name: "Mulligans", aliases: ["Mr Mulligan's Lost World Golf"] },
      { name: "Boom Battle Bar" },
      { name: "Cineworld" },
      { name: "Fairlands Valley Park" },
      { name: "Great Ashby District Park" },
      { name: "Stevenage Swimming Centre" },
      { name: "Stevenage Leisure Centre", aliases: ["Stevenage Arts and Leisure Centre"] },
      { name: "Marriotts", aliases: ["Marriotts Sports Centre", "Marriotts Sports Center"] },
      { name: "Stevenage Museum" },
      { name: "Gordon Craig Theatre" },
      { name: "Knebworth House" },
    ],
  },
];

export function validationRegion(label: string): ValidationRegion | null {
  return VALIDATION_REGIONS.find((r) => r.label.toLowerCase() === label.trim().toLowerCase()) ?? null;
}

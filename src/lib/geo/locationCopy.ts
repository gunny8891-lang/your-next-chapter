/**
 * The words used wherever a member is asked where they live (setting up, and later in
 * Account), kept in one place so both say the same thing. What the lookup can actually do
 * (src/lib/geo/geocode.ts, tried on real input): a town ("Bath"), a town and county
 * ("Bath, Somerset"), a full postcode ("BA1 1AA") or the first half of one ("TW9") all
 * find the place; a full street address is reduced to its town, so asking for one gains
 * nothing and collects more than is needed; a made-up place finds nothing.
 */

export const LOCATION_LABEL = "Your home town or postcode";

export const LOCATION_PLACEHOLDER = "e.g. Bath, or BA1 1AA";

/** Under the question while setting up. */
export const LOCATION_HINT_SETUP = "A town or a postcode is enough. There's no need to give your full address.";

/** In Account, where changing it has a consequence the member should know about. */
export const LOCATION_HINT_ACCOUNT =
  "A town or a postcode is enough: there's no need for your full address. We use it to find ideas near you. Changing it builds a fresh plan for this week.";

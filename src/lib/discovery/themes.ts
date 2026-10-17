/**
 * The focused searches that find what one general search misses: the smaller groups and sessions that are most of what
 * makes a town worth living in for someone who is no longer at work, and that no map lists. A general "find things for
 * retirees" search comes back lopsided toward whatever ranks best (a National Trust house, a council page); asking for one
 * kind of thing at a time finds that kind properly.
 *
 * The same list is used for every town. Nothing here names a place.
 */

export type DiscoveryTheme = {
  key: string;
  label: string;
  /** What to look for, in the words the search is given. */
  focus: string;
};

export const DISCOVERY_THEMES: DiscoveryTheme[] = [
  {
    key: "groups",
    label: "Social groups and clubs",
    focus:
      "social groups and clubs that meet regularly: the local U3A (University of the Third Age) branch and its interest groups, coffee mornings, lunch clubs, " +
      "tea dances, friendship and over-50s clubs, men's sheds, women's groups, Women's Institute branches, and library or church-hall drop-in sessions",
  },
  {
    key: "walking",
    label: "Walking and outdoor groups",
    focus:
      "walking and outdoor groups: Walking for Health walks, Ramblers groups, guided and led walks, Nordic walking, parkrun and other beginner running, " +
      "cycling groups and easy rides, community gardening and conservation volunteering days, and waymarked local walking and cycling trails",
  },
  {
    key: "fitness",
    label: "Fitness for older adults",
    focus:
      "gentle and older-adult fitness: over-50s and over-60s exercise classes, walking football, Back to Netball, strength and balance classes, chair exercise, " +
      "tai chi, yoga and pilates for beginners, aqua classes, badminton, tennis and table tennis for beginners, and bowls clubs that welcome new members",
  },
  {
    key: "creative",
    label: "Creative and learning groups",
    focus:
      "creative and learning groups: knitting, sewing and crochet groups, art and pottery classes, photography clubs, book clubs and reading groups, " +
      "local history talks and walks, adult education workshops, writing groups, choirs and singing groups, and museum or library workshops",
  },
  {
    key: "volunteering",
    label: "Volunteering",
    focus:
      "volunteering opportunities for someone with spare time: befriending and walking-companion schemes, charity shops, community gardens and allotments, " +
      "conservation and park volunteering, hospital, museum and library volunteering, foodbanks and community cafes, run by the council, Age UK or local charities",
  },
  {
    key: "entertainment",
    label: "Indoor entertainment and family venues",
    focus:
      "indoor entertainment and family venues that are not on a map as such: trampoline and active play parks, soft play centres, bowling, adventure and crazy golf, " +
      "escape rooms, competitive-socialising venues (darts, axe throwing, shuffleboard, crazy-golf bars), cinemas with senior, relaxed or family screenings, and local visitor attractions",
  },
  {
    key: "grandchildren",
    label: "Things to do with grandchildren",
    focus:
      "things a grandparent can do with grandchildren: soft play and toddler sessions, library story and rhyme times, parent-and-toddler or grandparent-and-child groups, " +
      "children's workshops and family days at museums, farms, wildlife parks and children's farms, family swimming sessions, family theatre, pantomime and children's cinema screenings, " +
      "and holiday activities, with the ages each is for where the page says",
  },
  {
    key: "events",
    label: "Dated events and seasonal happenings",
    focus:
      "dated events in the next three months that the local council, museum, theatre and community groups list on their own what's-on pages: talks, workshops, " +
      "markets and fairs, exhibitions, festivals, seasonal events (Christmas lights and markets, fireworks), theatre and comedy seasons, and free community events",
  },
];

export function themeByKey(key: string): DiscoveryTheme | undefined {
  return DISCOVERY_THEMES.find((t) => t.key === key);
}

/** The throttle key for a theme within a place: kept apart from the place's own (general search) state. */
export const THEME_KEY_SEPARATOR = "#";

export function themedKey(placeKey: string, theme: string): string {
  return `${placeKey}${THEME_KEY_SEPARATOR}${theme}`;
}

export function isThemedKey(key: string): boolean {
  return key.includes(THEME_KEY_SEPARATOR);
}

/** A themed search is for things that change slowly, so it is not repeated as often as the general one. */
export const THEME_REFRESH_DAYS = 30;

/** The "theme" under which an organiser's own pages are reread (see organisers.ts): not a search, so it has no entry in DISCOVERY_THEMES. */
export const ORGANISER_THEME = "organiser";

/**
 * How often a theme is repeated. Dated events go stale in weeks (what is on is looked at for the next three months), and
 * an organiser's page keeps listing new ones, so both come round every two weeks; the rest change slowly and keep the month.
 */
const REFRESH_DAYS_BY_THEME: Record<string, number> = { events: 14, [ORGANISER_THEME]: 14 };
export function refreshDaysFor(theme: string): number {
  return REFRESH_DAYS_BY_THEME[theme] ?? THEME_REFRESH_DAYS;
}

/** A photograph of a place, with what we must show alongside it. */
export type PlaceImage = {
  /** A resized copy hosted by Wikimedia (see next.config.ts for the allowed host). */
  src: string;
  alt: string;
  /** The line shown on the picture: "Photo: Diliff · CC BY-SA 3.0". */
  credit: string;
  /** The file's page, where the author and licence are recorded in full. */
  sourceUrl: string;
  license: string;
  /** A stand-in picture of the kind of thing it is, not of this place (see fallback.ts). No credit, and decorative. */
  generic?: boolean;
};

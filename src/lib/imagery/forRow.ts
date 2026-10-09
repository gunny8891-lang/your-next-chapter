import { fallbackImageFor } from "@/lib/imagery/fallback";
import type { PlaceImage } from "@/lib/imagery/types";

type RowWithImage = {
  tags: string[] | null;
  image_url?: string | null;
  image_alt?: string | null;
  image_credit?: string | null;
  image_license?: string | null;
  image_source_url?: string | null;
};

/**
 * The picture for a catalogue row, wherever it is shown: its own photograph (with the credit that must go with it) when
 * there is one, otherwise a calm stand-in for the kind of thing it is, otherwise nothing, and the card shows its tonal
 * panel. The same rule the idea cards follow, so a place looks the same on My Week as it did when it was suggested.
 */
export function imageForRow(row: RowWithImage): PlaceImage | null {
  if (row.image_url) {
    return {
      src: row.image_url,
      alt: row.image_alt ?? "",
      credit: row.image_credit ?? "",
      sourceUrl: row.image_source_url ?? "",
      license: row.image_license ?? "",
    };
  }
  return fallbackImageFor(row.tags ?? []);
}

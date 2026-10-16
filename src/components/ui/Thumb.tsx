import Image from "next/image";
import { CATEGORY, type CategoryName } from "@/lib/categories";
import { CATEGORY_COLOR } from "@/lib/theme";
import type { CoverImage } from "@/components/ui/Cover";
import styles from "@/components/ui/Thumb.module.css";

type ThumbProps = {
  category: CategoryName;
  image?: (CoverImage & { generic?: boolean; license?: string }) | null;
  /**
   * Whether the photographer's credit is shown on the same screen. Where it is not, only a picture that asks for no credit is
   * used (the calm stand-ins, and anything public domain), so nobody's photograph is shown without its attribution.
   */
  creditNearby?: boolean;
};

/** Pure: whether a picture may be shown without its credit beside it. */
export function needsNoCredit(image: { generic?: boolean; license?: string } | null | undefined): boolean {
  return Boolean(image && (image.generic || /^(cc0|public domain|pd)/i.test(image.license ?? "")));
}

export function Thumb({ category, image, creditNearby = false }: ThumbProps) {
  const Icon = CATEGORY[category]?.icon;
  const colour = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Joy;
  const shown = image && (creditNearby || needsNoCredit(image)) ? image : null;

  return (
    <span className={styles.thumb} style={{ ["--thumb-color" as string]: colour }} aria-hidden="true">
      {shown ? (
        <Image src={shown.src} alt="" fill sizes="72px" className={styles.image} />
      ) : (
        <span className={styles.fallback}>{Icon && <Icon strokeWidth={1.5} />}</span>
      )}
    </span>
  );
}

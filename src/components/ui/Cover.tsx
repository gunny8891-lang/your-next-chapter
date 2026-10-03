import Image from "next/image";
import { CATEGORY, type CategoryName } from "@/lib/categories";
import { CATEGORY_COLOR } from "@/lib/theme";
import styles from "@/components/ui/Cover.module.css";

export type CoverImage = { src: string; alt: string; credit?: string };

type CoverProps = {
  category: CategoryName;
  image?: CoverImage | null;
  /** wide (16:9) for a hero, card (4:3) for a grid, banner (2.4:1) for a list in a narrow space. */
  ratio?: "wide" | "card" | "banner";
};

/**
 * The picture at the top of a card. Shows the photograph when there is one, and
 * otherwise a tonal panel with the category's line icon, so cards look finished
 * from the first day and a photo simply takes the panel's place.
 */
export function Cover({ category, image, ratio = "wide" }: CoverProps) {
  const Icon = CATEGORY[category]?.icon;
  const colour = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Joy;

  return (
    <div className={`${styles.cover} ${styles[ratio]}`} style={{ ["--cover-color" as string]: colour }}>
      {image ? (
        <>
          <Image src={image.src} alt={image.alt} fill sizes="(min-width: 768px) 640px, 100vw" className={styles.image} />
          {image.credit && <span className={styles.credit}>{image.credit}</span>}
        </>
      ) : (
        <div className={styles.fallback} aria-hidden="true">
          {Icon && <Icon strokeWidth={1.25} />}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { Notice } from "@/components/ui";
import { LEGAL_LAST_UPDATED, OPERATOR_FIELD_LABELS, missingOperatorDetails } from "@/lib/legal/details";
import type { Block, Section } from "@/lib/legal/privacy";
import styles from "@/components/LegalPage.module.css";

function renderBlock(block: Block, index: number) {
  if ("p" in block) return <p key={index}>{block.p}</p>;
  if ("ul" in block) {
    return (
      <ul key={index}>
        {block.ul.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <dl key={index} className={styles.terms}>
      {block.dl.map((entry) => (
        <div key={entry.term}>
          <dt>{entry.term}</dt>
          <dd>{entry.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A long, plain document (the privacy notice, the terms): a short contents list, then
 * numbered-by-heading sections in a comfortable reading width. While the company's
 * details are still to be supplied, a banner says so rather than hiding the gap.
 */
export function LegalPage({
  title,
  lead,
  sections,
  other,
}: {
  title: string;
  lead: string;
  sections: Section[];
  other: { href: string; label: string };
}) {
  const missing = missingOperatorDetails();

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Your Next Chapter
        </Link>

        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
          <p className={styles.updated}>Last updated {LEGAL_LAST_UPDATED}</p>
        </header>

        {missing.length > 0 && (
          <Notice tone="info">
            <strong>Draft.</strong> This is a working draft that has not yet been reviewed by a solicitor, and the company details are still to be added ({missing.map((m) => OPERATOR_FIELD_LABELS[m]).join(", ")}).
          </Notice>
        )}

        <nav aria-label="On this page" className={styles.contents}>
          <h2 className={styles.contentsTitle}>On this page</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className={styles.body}>
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              {s.blocks.map(renderBlock)}
            </section>
          ))}
        </div>

        <footer className={styles.footer}>
          <Link href={other.href}>{other.label}</Link>
          <Link href="/">Back to the start</Link>
        </footer>
      </div>
    </main>
  );
}

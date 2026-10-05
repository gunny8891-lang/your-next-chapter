import Image from "next/image";
import Link from "next/link";
import { Clock, Footprints, Heart } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui";
import styles from "@/app/Landing.module.css";

const POINTS = [
  { icon: Clock, text: "An idea for the time you actually have, whether that's an hour or an afternoon." },
  { icon: Footprints, text: "Planned from your door to home again: the walk, the lunch, the way back." },
  { icon: Heart, text: "It learns what you enjoy, so each day's suggestions feel more like you." },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className={styles.page}>
      <div className={styles.photo}>
        <Image
          src="/images/fallback/woodland.jpg"
          alt="A sunlit path through the woods"
          fill
          priority
          sizes="(min-width: 900px) 50vw, 100vw"
          className={styles.image}
        />
      </div>

      <div className={styles.copy}>
        <p className={styles.brand}>Your Next Chapter</p>
        <h1 className={styles.title}>You have time. Here&apos;s something good to do with it.</h1>
        <p className={styles.lead}>
          Tell us a little about yourself, and every day you&apos;ll find a few ideas worth your time: walks, galleries,
          lunches, classes, close to home and planned from start to finish.
        </p>

        <div className={styles.actions}>
          {user ? (
            <Button href="/today" variant="accent">
              Continue to today
            </Button>
          ) : (
            <>
              <Button href="/signup" variant="accent">
                Get started
              </Button>
              <Button href="/login" variant="secondary">
                Log in
              </Button>
            </>
          )}
        </div>

        <ul className={styles.points}>
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <nav aria-label="Legal" className={styles.legal}>
          <Link href="/privacy">Privacy notice</Link>
          <Link href="/terms">Terms of use</Link>
        </nav>
      </div>
    </main>
  );
}

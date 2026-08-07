import type { Metadata } from "next";
import Link from "next/link";
import { Ring } from "../_landing/ring";
import styles from "../_landing/landing.module.css";

export const metadata: Metadata = {
  title: "How we operate",
  description:
    "How Production Circles works: a job board with the personal support of a placement agency, both sides vetted by a real person.",
};

/** Paragraphs as data so the apostrophes stay in plain strings (no JSX-text
 *  escaping) and the first one gets the serif lead-in via CSS. */
const PARAGRAPHS: string[] = [
  "Production Circles is a different kind of job board for freelance video and production professionals — and the companies, agencies, and producers who hire them.",
  "We combine the convenience of a job board with the personal support of a placement agency. Whether you're applying for work or hiring for a production, you'll hear from a real person.",
  "Every applicant and every employer is personally reviewed and contacted before joining. That means the listings are real, the applicants are qualified, and the people behind both are who they say they are.",
  "We can also help employers identify the right candidates instead of leaving them to sort through an endless pile of applications. Producers who already know exactly who they need can simply post a job and manage the hiring themselves.",
  "To keep the network useful, we limit how many people join on both sides. We'd rather serve a smaller, trusted production community well than become another overcrowded job board.",
];

export default function HowWeOperate() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <div className={styles.wrap}>
          <Link href="/" className={styles.backlink}>
            ← Back to home
          </Link>
          <div className={styles.articleHead}>
            <span className={styles.eyebrow}>Production Circles</span>
            <h1 className={styles.articleTitle}>How we operate</h1>
          </div>
          <div className={styles.prose}>
            {PARAGRAPHS.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
      </article>

      <section className={styles.ctaBlock}>
        <div className={styles.wrap}>
          <Ring className={styles.irisHero} />
          <p className={styles.payoff}>Join the circle.</p>
          <div className={styles.ctaRow}>
            <Link href="/sign-up?role=freelancer" className={`${styles.btn} ${styles.btnPrimary}`}>
              <span className={styles.dot} />
              Get hired
            </Link>
            <Link href="/sign-up?role=employer" className={`${styles.btn} ${styles.btnGhost}`}>
              <span className={styles.dot} />
              Hire crew
            </Link>
          </div>
          <div className={styles.reassure}>
            <span className={styles.tick}>◍</span> Free to join · every member vetted by a real
            phone call
          </div>
        </div>
      </section>
    </main>
  );
}

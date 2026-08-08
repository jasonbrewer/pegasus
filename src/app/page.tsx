import Link from "next/link";
import { Ring } from "./_landing/ring";
import styles from "./_landing/landing.module.css";

/**
 * The one page a signed-out visitor sees.
 *
 * Header and footer come from the root layout (TopNav / SiteFooter), so this
 * file is only the body. Brand styling lives in _landing/landing.module.css,
 * scoped so it never touches the app's semantic tokens or dark mode.
 *
 * Two doors: Get hired -> freelancer signup, Hire crew -> employer signup.
 * The role query is read by handle_new_user() at signup, so the button choice
 * is what sets which side of the marketplace the account lands on.
 */

const POINTS: { claim: string; detail: string }[] = [
  {
    claim: "Free to post, free to apply",
    detail: "No paywalls. Employers and applicants connect for free.",
  },
  {
    claim: "Every member gets a real call",
    detail: "We personally review and call every employer and applicant before they join.",
  },
  {
    claim: "More than a job board",
    detail: "We help employers find the right match — or they can manage hiring themselves.",
  },
  {
    claim: "Know who you're applying to",
    detail: "Every listing shows the real company, agency, producer, or network hiring.",
  },
  {
    claim: "A limited, trusted network",
    detail: "We cap membership on both sides so we can give everyone real support.",
  },
  {
    claim: "Your details stay private",
    detail:
      "Your contact information is never sold or made public. Employers get it only when you apply.",
  },
  {
    claim: "No pay-to-win rankings",
    detail: "Matches are based on fit and location — not who paid more.",
  },
  {
    claim: "Paste your credits your way",
    detail: "Add your résumé or credits without rebuilding them in a rigid form.",
  },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}>A hiring circle for video production</span>
          <h1 className={styles.title}>
            Where businesses find independent video production professionals.
          </h1>
          <Ring className={styles.irisHero} />
          <p className={styles.payoff}>It's free for everyone - Our (human) team personally assists employers in hiring the perfect video partner</p>

          <div className={styles.ctaRow}>
            <Link href="/sign-up?role=employer" className={`${styles.btn} ${styles.btnGhost}`}>
              <span className={styles.dot} />
              I need to hire a video production professional
            </Link>
            <Link href="/sign-up?role=freelancer" className={`${styles.btn} ${styles.btnPrimary}`}>
              <span className={styles.dot} />
              Video Pros - click here to get hired
            </Link>
          </div>

          <div className={styles.reassure}>
            <span className={styles.tick}>◍</span> Free to join · every member vetted by a real
            phone call
          </div>
        </div>
      </section>

      <section className={styles.diff}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.label}>{"Why we're different"}</span>
            <div className={styles.rule} />
          </div>

          <div className={styles.grid}>
            {POINTS.map((point) => (
              <div key={point.claim} className={styles.cell}>
                <Ring className={styles.mark} />
                <h3 className={styles.cellTitle}>{point.claim}</h3>
                <p className={styles.cellBody}>{point.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.operate}>
        <div className={styles.wrap}>
          <Link href="/how-we-operate" className={styles.operateLink}>
            Read more about how we operate <span className={styles.arw}>→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";

/** Short privacy notice for the assessment landing page (candidates arrive here from their invite link). */
export default function PrivacySummary() {
  return (
    <section className="privacy-box" aria-labelledby="privacy-h">
      <h3 id="privacy-h">Privacy notice</h3>
      <p className="small">
        My Mountain Mover Inc. collects your <b>name and email address</b> (from the account you sign in with), your <b>answers, score and
        start and submit times</b>, and <b>activity during the assessment</b> such as leaving the window or exiting fullscreen.
      </p>
      <p className="small">
        We use this only to evaluate your application, apply our retake policy and improve our assessments. Results are seen by our
        evaluation team only, and we don’t sell your information or use it for advertising. Sign-in only confirms your name and email:
        we don’t get your password or access to your email, files or contacts.
      </p>
      <p className="small" style={{ marginBottom: 0 }}>
        Questions or requests to delete your data: lead@mymountainmover.com ·{" "}
        <Link href="/privacy" target="_blank" rel="noreferrer">Full privacy notice ↗</Link>
      </p>
    </section>
  );
}

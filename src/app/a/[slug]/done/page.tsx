import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { currentUser } from "@/lib/auth";
import { getMeta } from "@/content/assessments";
import { latestAttempt } from "@/lib/attempts";

export default async function Done({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = getMeta(slug);
  if (!meta) notFound();
  const user = await currentUser();
  const last = user ? await latestAttempt(slug, user.email) : null;
  const timedOut = last?.status === "timed_out";
  const next = meta.offerNext ? getMeta(meta.offerNext) : undefined;
  return (
    <>
      <TopBar email={user?.email} />
      <main className="wrap">
        <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 28 }}>{timedOut ? "⏱" : "✓"}</div>
          <h1>{timedOut ? "Time’s up" : "Your assessment has been submitted"}</h1>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto" }}>
            {timedOut
              ? `The ${meta.timeLimitMinutes}-minute time limit for the ${meta.title} assessment has ended. The answers you saved were submitted automatically, and the evaluation team will review them and be in touch about next steps.`
              : `Thank you for completing the ${meta.title} assessment. The evaluation team will review your submission and be in touch about next steps.`}
          </p>
        </div>
        {next && (
          <div className="card">
            <h2>Optional: {next.title} assessment</h2>
            <p className="muted">
              To further strengthen your profile, you may also take the {next.title} assessment. It’s timed separately at {next.timeLimitMinutes} minutes.
              You can start it now or come back later using the same sign-in.
            </p>
            <Link className="btn btn-primary" href={`/a/${next.slug}`}>Continue to {next.title}</Link>
          </div>
        )}
      </main>
    </>
  );
}

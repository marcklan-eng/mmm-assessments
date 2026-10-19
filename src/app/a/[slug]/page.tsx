import { totalItems } from "@/content/answers";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import SignIn from "@/components/SignIn";
import StartForm from "@/components/StartForm";
import PrivacySummary from "@/components/PrivacySummary";
import LocalTime from "@/components/LocalTime";
import { parseSent, WINDOW_HOURS } from "@/lib/access";
import { currentUser, enabledProviders } from "@/lib/auth";
import { getEligibility } from "@/lib/attempts";
import { getMeta } from "@/content/assessments";
import { getContent, allQuestions } from "@/content";

export const dynamic = "force-dynamic";

const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function AssessmentLanding({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const sentRaw = typeof sp.sent === "string" ? sp.sent : null;
  const sent = parseSent(sentRaw);
  const here = `/a/${slug}${sentRaw ? `?sent=${encodeURIComponent(sentRaw)}` : ""}`;
  const meta = getMeta(slug);
  if (!meta) notFound();
  const user = await currentUser();
  const content = await getContent(slug);

  let body: React.ReactNode;
  if (!user) {
    body = (
      <>
        <SignIn callbackUrl={here} providers={enabledProviders} heading="Sign in to begin" />
        <PrivacySummary />
      </>
    );
  } else {
    const e = await getEligibility(slug, user.email, sent);
    switch (e.state) {
      case "needs-prerequisite": {
        const pre = getMeta(e.prerequisite)!;
        body = (
          <>
            <h2>Complete {pre.title} first</h2>
            <p className="muted">The {meta.title} assessment opens after you’ve completed the {pre.title} assessment.</p>
            <Link className="btn btn-primary" href={`/a/${pre.slug}`}>Go to {pre.title}</Link>
          </>
        );
        break;
      }
      case "coming-soon":
        body = (
          <>
            <h2>Coming soon</h2>
            <p className="muted">This assessment isn’t available yet. Please check back later or contact lead@mymountainmover.com.</p>
          </>
        );
        break;
      case "locked":
        body = (
          <>
            <h2>You’ve already completed this assessment</h2>
            <p className="muted">Thank you. Your submission has been received and is with the evaluation team.</p>
            <div className="notice notice-info">You can retake this assessment after <b>{fmt(e.retakeAfter)}</b>.</div>
          </>
        );
        break;
      case "expired":
        body = (
          <>
            <h2>This assessment link has expired</h2>
            <p className="muted">
              Your invitation asked you to complete this assessment within {WINDOW_HOURS} hours of receiving the email. That period ended on{" "}
              <b><LocalTime ms={e.expiredAt} /></b>.
            </p>
            <p className="muted">If you believe this is a mistake, please contact the LEAD Department at lead@mymountainmover.com.</p>
          </>
        );
        break;
      case "in-progress":
        body = (
          <>
            <h2>Your assessment is in progress</h2>
            <p className="muted">The timer kept running while you were away. Resume now to use your remaining time.</p>
            <Link className="btn btn-primary" href={`/a/${slug}/take`}>Resume assessment</Link>
          </>
        );
        break;
      case "eligible":
        body = (
          <>
            {content?.intro.map((p, i) => <p key={i} className={i ? "muted" : ""}>{p}</p>)}
            <div className="facts">
              <div className="fact"><b>{content ? totalItems(allQuestions(content)) : 0}</b><span>{content && allQuestions(content).every((q) => q.options.length) ? "multiple-choice questions" : "questions"}</span></div>
              <div className="fact"><b>{meta.timeLimitMinutes} minutes</b><span>one timer for the whole assessment</span></div>
              <div className="fact"><b>One attempt</b>{e.expiresAt && <span>link expires <LocalTime ms={e.expiresAt} /></span>}</div>
            </div>
            <h3>Before you start</h3>
            <ul className="clean muted">
              <li>The assessment runs in <b>fullscreen</b>. Leaving fullscreen or switching windows hides the questions, and it is recorded.</li>
              <li>The timer starts when you click Start and keeps running if you close the page.</li>
              <li>Answers save automatically. When time runs out, your answers are submitted.</li>
              <li>
                Use a computer with a stable connection
                {(() => {
                  const kinds = new Set((content?.sections ?? []).flatMap((s) => (s.stimuli ?? []).map((st) => st.type)));
                  const what = [kinds.has("video") && "a short video", kinds.has("audio") && "audio recordings"].filter(Boolean).join(" and ");
                  return what ? ` and sound (there ${kinds.has("audio") ? "are" : "is"} ${what}).` : ".";
                })()}
              </li>
            </ul>
            <PrivacySummary />
            <StartForm slug={slug} defaultName={user.name} minutes={meta.timeLimitMinutes} sent={sentRaw} />
          </>
        );
        break;
      default:
        notFound();
    }
  }

  return (
    <>
      <TopBar email={user?.email} />
      <main className="wrap">
        <p className="eyebrow">Skills Evaluation Assessment (SEA)</p>
        <h1>{meta.title} Assessment</h1>
        <div className="card" style={{ marginTop: 16 }}>{body}</div>
      </main>
    </>
  );
}

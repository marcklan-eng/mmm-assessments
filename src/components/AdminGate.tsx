import TopBar from "./TopBar";
import SignIn from "./SignIn";
import { currentUser, enabledProviders, type SessionUser } from "@/lib/auth";
import { canViewQuestions, isEvaluator, sharingProblem } from "@/lib/evaluators";

/** Renders children(user) only for evaluators (people the results Sheet is shared with). */
export default async function AdminGate({
  path,
  children,
  access = "results",
}: {
  path: string;
  children: (u: SessionUser) => Promise<React.ReactNode>;
  access?: "results" | "questions";
}) {
  const user = await currentUser();
  if (!user) {
    return (
      <>
        <TopBar />
        <main className="wrap" style={{ maxWidth: 480 }}>
          <div className="card">
            <SignIn callbackUrl={path} providers={enabledProviders} heading="Evaluator sign-in" />
          </div>
        </main>
      </>
    );
  }
  const ok = access === "questions" ? await canViewQuestions(user.email) : await isEvaluator(user.email);
  if (!ok) {
    const problem = await sharingProblem(access);
    if (problem) {
      return (
        <>
          <TopBar email={user.email} />
          <main className="wrap" style={{ maxWidth: 560 }}>
            <div className="card">
              <h2>Can’t reach the {access === "questions" ? "questions" : "results"} Sheet</h2>
              <p className="muted">The app couldn’t read who the Sheet is shared with, so it can’t confirm your access. The Sheet’s script said:</p>
              <div className="notice notice-bad small">{problem}</div>
              <p className="small muted" style={{ marginTop: 12 }}>
                This usually happens right after the Apps Script is changed: check that the <code>SECRET</code> line in Code.gs still has the
                same password as before, then <b>Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy</b>. Reload this page after that.
              </p>
            </div>
          </main>
        </>
      );
    }
    return (
      <>
        <TopBar email={user.email} />
        <main className="wrap" style={{ maxWidth: 560 }}>
          <div className="card">
            <h2>No dashboard access</h2>
            <p className="muted">
              {access === "questions" ? "The question bank" : "The dashboard"} is open to people the{" "}
              {access === "questions" ? "questions" : "results"} Google Sheet is shared with. Ask the Sheet owner to share it with
              <b> {user.email}</b> (by email, not “anyone with the link”), then reload this page in a few minutes.
            </p>
          </div>
        </main>
      </>
    );
  }
  return <>{await children(user)}</>;
}

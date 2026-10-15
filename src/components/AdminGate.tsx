import TopBar from "./TopBar";
import SignIn from "./SignIn";
import { currentUser, enabledProviders, type SessionUser } from "@/lib/auth";
import { canViewQuestions, isEvaluator } from "@/lib/evaluators";

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

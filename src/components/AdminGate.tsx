import TopBar from "./TopBar";
import SignIn from "./SignIn";
import { currentUser, enabledProviders, type SessionUser } from "@/lib/auth";
import { isEvaluator } from "@/lib/evaluators";

/** Renders children(user) only for evaluators (people the results Sheet is shared with). */
export default async function AdminGate({ path, children }: { path: string; children: (u: SessionUser) => Promise<React.ReactNode> }) {
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
  if (!(await isEvaluator(user.email))) {
    return (
      <>
        <TopBar email={user.email} />
        <main className="wrap" style={{ maxWidth: 560 }}>
          <div className="card">
            <h2>No dashboard access</h2>
            <p className="muted">
              The dashboard is open to people the results Google Sheet is shared with. Ask the Sheet owner to share it with
              <b> {user.email}</b> (by email, not “anyone with the link”), then reload this page in a few minutes.
            </p>
          </div>
        </main>
      </>
    );
  }
  return <>{await children(user)}</>;
}

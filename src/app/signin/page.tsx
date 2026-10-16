import TopBar from "@/components/TopBar";
import SignIn from "@/components/SignIn";
import { enabledProviders } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  OAuthSignin: "Couldn't start the sign-in. Please try again.",
  OAuthCallback: "Sign-in with Google/Microsoft didn't complete. Please try again; if it keeps happening, contact lead@mymountainmover.com.",
  OAuthAccountNotLinked: "Please sign in the same way you did before.",
  AccessDenied: "Sign-in was cancelled or not allowed.",
  Callback: "Sign-in didn't complete. Please try again.",
  Configuration: "Sign-in isn't set up correctly yet. Please contact lead@mymountainmover.com.",
  CredentialsSignin: "Enter a valid email address.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const safe = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  return (
    <>
      <TopBar />
      <main className="wrap" style={{ maxWidth: 480 }}>
        {error && (
          <div className="notice notice-bad" style={{ marginBottom: 12 }} role="alert">
            {ERRORS[error] ?? "Sign-in didn't complete. Please try again."} <span className="small">({error})</span>
          </div>
        )}
        <div className="card">
          <SignIn callbackUrl={safe} providers={enabledProviders} heading="Sign in" />
        </div>
      </main>
    </>
  );
}

import TopBar from "@/components/TopBar";
import SignIn from "@/components/SignIn";
import { enabledProviders } from "@/lib/auth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const safe = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  return (
    <>
      <TopBar />
      <main className="wrap" style={{ maxWidth: 480 }}>
        <div className="card">
          <SignIn callbackUrl={safe} providers={enabledProviders} heading="Sign in" />
        </div>
      </main>
    </>
  );
}

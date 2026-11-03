import Link from "next/link";
import SignOutButton from "./SignOutButton";
import { testMode } from "@/lib/db";

export default function TopBar({ email, right }: { email?: string; right?: React.ReactNode }) {
  return (
    <>
    {testMode && (
      <div className="test-banner" role="status">
        TEST COPY: anything saved here is temporary and is not written to the results Sheet. Don’t send this link to candidates.
      </div>
    )}
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">MM</span>
        <span>Skills Evaluation Assessment (SEA)</span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {right}
        {email && (
          <>
            <span className="small muted" style={{ overflowWrap: "anywhere" }}>{email}</span>
            <SignOutButton />
          </>
        )}
      </div>
    </header>
    </>
  );
}

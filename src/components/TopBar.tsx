import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default function TopBar({ email, right }: { email?: string; right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">MM</span>
        <span>Skills Assessment</span>
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
  );
}

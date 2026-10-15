"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button className="btn small" style={{ minHeight: 34, padding: "6px 12px" }} onClick={() => signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}

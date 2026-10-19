"use client";
import { useState } from "react";

export default function StartForm({ slug, defaultName, minutes = 30 }: { slug: string; defaultName: string; minutes?: number }) {
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/attempts/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name, agreed }),
    });
    if (res.ok) window.location.href = `/a/${slug}/take`;
    else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error === "locked" ? "You’ve already completed this assessment." : "Could not start the assessment. Please refresh and try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="field">
        <label htmlFor="name">First and last name</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span className="small">
          <b>NOTICE:</b> This assessment and its contents are strictly and exclusively owned by My Mountain Mover Inc. and shall not be
          distributed and/or shared with anyone outside the company. Failure to abide by the signed Non-Disclosure Agreement shall be
          penalized under the laws of the Philippines. <b>I agree.</b>
        </span>
      </label>
      {err && <p className="small" style={{ color: "var(--bad)", marginTop: 10 }}>{err}</p>}
      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!agreed || name.trim().length < 2 || busy} onClick={start}>
        {busy ? "Starting…" : `Start assessment (${minutes}:00)`}
      </button>
    </div>
  );
}

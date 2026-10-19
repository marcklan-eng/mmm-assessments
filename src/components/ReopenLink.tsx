"use client";
import { useState } from "react";

/** Evaluator tool: give a candidate a fresh link window for one assessment. */
export default function ReopenLink({ assessments, hours }: { assessments: { slug: string; title: string }[]; hours: number }) {
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(assessments[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function reopen() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await fetch("/api/admin/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't reopen the link.");
      const until = new Date(j.expiresAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      setMsg(`${email.trim()} can use the ${j.title} link again until ${until}. Send them the same link.`);
      setEmail("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="panel section-gap">
      <h2>Reopen an expired link</h2>
      <p className="sub">
        Candidates have {hours} hours from their invitation email (or from first opening the link) to complete each assessment. To give
        someone a new {hours} hours, enter their email and pick the assessment. It doesn’t give a retake to someone who already submitted.
      </p>
      <div className="filters" style={{ marginTop: 0 }}>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label htmlFor="reopen-email">Candidate email</label>
          <input id="reopen-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="field">
          <label htmlFor="reopen-slug">Assessment</label>
          <select id="reopen-slug" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {assessments.map((a) => <option key={a.slug} value={a.slug}>{a.title}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={reopen} disabled={busy || !email.trim()}>{busy ? "Reopening…" : `Give ${hours} more hours`}</button>
      </div>
      {msg && <div className="notice notice-info small" role="status">{msg}</div>}
      {err && <div className="notice notice-bad small" role="alert">{err}</div>}
    </div>
  );
}

"use client";
import { useState } from "react";

type Setting = { hours: number; updatedBy?: string; updatedAt?: number; fromVercel: boolean };

/** Dashboard panel: turn invite-link expiry on/off, and give a candidate a fresh window. */
export default function ReopenLink({ assessments, initial, canEdit }: { assessments: { slug: string; title: string }[]; initial: Setting; canEdit: boolean }) {
  const [setting, setSetting] = useState(initial);
  const [hoursInput, setHoursInput] = useState(String(initial.hours || 48));
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(assessments[0]?.slug ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const on = setting.hours > 0;

  async function save(hours: number) {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const r = await fetch("/api/admin/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't save.");
      setSetting(j);
      setMsg(hours > 0 ? `Links now expire ${hours} hours after the invitation email (or first opening the link).` : "Links no longer expire.");
    } catch (e) {
      setErr((e as Error).message);
    }
    setSaving(false);
  }

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

  const h = Number(hoursInput);
  const validHours = Number.isInteger(h) && h >= 1 && h <= 720;

  return (
    <div className="panel section-gap">
      <div className="dash-head">
        <div>
          <h2>Link expiry</h2>
          <p className="sub">
            {on
              ? `On: a candidate who opens their link more than ${setting.hours} hours after their invitation email (or after first opening it) sees “This assessment link has expired” and can’t start.`
              : "Off: candidates can start the assessment any time they open the link."}
            {setting.updatedBy && ` Last changed by ${setting.updatedBy}.`}
          </p>
        </div>
        <span className={`pill ${on ? "pill-good" : "pill-neutral"}`}>{on ? `On · ${setting.hours} hours` : "Off"}</span>
      </div>

      {setting.fromVercel ? (
        <p className="small muted">Set in Vercel (LINK_EXPIRY_HOURS). Remove that setting to control it here.</p>
      ) : canEdit ? (
        <div className="filters" style={{ marginTop: 0, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "0 1 160px" }}>
            <label htmlFor="expiry-hours">Hours after the email</label>
            <input id="expiry-hours" className="input" type="number" min={1} max={720} value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={saving || !validHours || (on && h === setting.hours)} onClick={() => save(h)}>
            {saving ? "Saving…" : on ? "Save hours" : "Turn on"}
          </button>
          {on && <button className="btn" disabled={saving} onClick={() => save(0)}>Turn off</button>}
        </div>
      ) : (
        <p className="small muted">Only people who can edit the questions Sheet can change this.</p>
      )}

      {on && (
        <>
          <h3 style={{ marginTop: 18 }}>Reopen an expired link</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Gives one candidate a new {setting.hours} hours for one assessment. It doesn’t give a retake to someone who already submitted.</p>
          <div className="filters" style={{ marginTop: 0, alignItems: "flex-end" }}>
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
            <button className="btn" onClick={reopen} disabled={busy || !email.trim()}>{busy ? "Reopening…" : `Give ${setting.hours} more hours`}</button>
          </div>
        </>
      )}
      {msg && <div className="notice notice-info small" role="status">{msg}</div>}
      {err && <div className="notice notice-bad small" role="alert">{err}</div>}
    </div>
  );
}

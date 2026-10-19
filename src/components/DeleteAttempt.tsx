"use client";
import { useState } from "react";

/** Delete (or restore) one attempt. Deleting lets the candidate take the assessment again with the same link. */
export default function DeleteAttempt({ id, name, title, deleted }: { id: string; name: string; title: string; deleted: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(action: "delete" | "restore") {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      window.location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <>
        <button className="btn" onClick={() => send("restore")} disabled={busy}>{busy ? "Restoring…" : "Restore attempt"}</button>
        {err && <div className="notice notice-bad small" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      </>
    );
  }
  return (
    <>
      <button className="btn btn-danger" onClick={() => setOpen(true)}>Delete attempt…</button>
      {open && (
        <div className="modal-back" role="dialog" aria-modal aria-labelledby="del-h">
          <div className="modal">
            <h2 id="del-h">Delete this attempt?</h2>
            <p className="muted small">
              <b>{name}</b>’s {title} attempt will be removed from the dashboard, its numbers and the CSV export, and <b>they’ll be able to take
              the {title} assessment again</b> with the same link. You can restore it later from the Deleted attempts list.
            </p>
            <p className="muted small">The row already written to the results Sheet stays there; delete it in the Sheet if you don’t want it.</p>
            <label className="small" style={{ display: "grid", gap: 4 }}>Reason (kept with the attempt)
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Test attempt / Technical issue, retake allowed" autoFocus />
            </label>
            {err && <div className="notice notice-bad small" role="alert" style={{ marginTop: 8 }}>{err}</div>}
            <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={() => { setOpen(false); setErr(""); }} disabled={busy}>Cancel</button>
              <button className="btn btn-primary btn-danger-fill" onClick={() => send("delete")} disabled={busy || reason.trim().length < 3}>{busy ? "Deleting…" : "Delete attempt"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

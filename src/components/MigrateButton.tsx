"use client";
import { useState } from "react";
import type { MigrationReport } from "@/lib/migrate";

export default function MigrateButton() {
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState<MigrationReport | null>(null);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true);
    setErr("");
    setRep(null);
    try {
      const r = await fetch("/api/admin/migrate", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Import failed (${r.status}).`);
      setRep(j);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div>
      <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Importing… (this can take a few minutes)" : "Import everything from the old app"}</button>
      {err && <div className="notice notice-bad small" role="alert" style={{ marginTop: 12 }}>{err}</div>}
      {rep && (
        <div className={`notice ${rep.errors.length ? "notice-warn" : "notice-info"} small`} role="status" style={{ marginTop: 12 }}>
          <b>Imported:</b> {rep.attempts} attempts · {rep.candidates} candidate records · {rep.settings} settings and question sets · {rep.mediaCopied} uploaded files
          {rep.mediaSkipped.length > 0 && <div style={{ marginTop: 6 }}>Not copied (set MEDIA_BUCKET and OLD_BLOB_READ_WRITE_TOKEN, then run again): {rep.mediaSkipped.join(", ")}</div>}
          {rep.errors.length > 0 && <ul className="clean" style={{ margin: "6px 0 0" }}>{rep.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

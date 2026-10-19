"use client";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

// Picks the images / audio / video for a section or a question, and writes them in the Sheet's format:
// one "file-name.png | Caption" per line (plus "Layout: side by side" for sections shown in a row).

export type MediaItem = { name: string; kind: "image" | "video" | "audio" | null };
type Entry = { file: string; caption: string };

const LAYOUT = /^layout\s*:/i;

function parse(value: string): { entries: Entry[]; sideBySide: boolean } {
  const ls = value.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    sideBySide: ls.some((l) => LAYOUT.test(l) && /side/i.test(l)),
    entries: ls.filter((l) => !LAYOUT.test(l)).map((l) => {
      const [f, ...c] = l.split("|");
      return { file: f.trim(), caption: c.join("|").trim() };
    }),
  };
}
function serialize(entries: Entry[], sideBySide: boolean): string {
  return [...entries.map((e) => (e.caption ? `${e.file} | ${e.caption}` : e.file)), ...(sideBySide ? ["Layout: side by side"] : [])].join("\n");
}
const kindOf = (name: string) =>
  /\.(png|jpe?g|gif|webp)$/i.test(name) ? "image" : /\.(mp3|m4a|wav|ogg)$/i.test(name) ? "audio" : /\.(mp4|webm|mov)$/i.test(name) ? "video" : null;

export default function MediaField({
  label,
  slug,
  value,
  onChange,
  library,
  canUpload,
  onUploaded,
  allowLayout,
}: {
  label: string;
  slug: string;
  value: string;
  onChange: (v: string) => void;
  library: MediaItem[];
  canUpload: boolean;
  onUploaded: () => Promise<void>;
  allowLayout?: boolean;
}) {
  const { entries, sideBySide } = parse(value);
  const [pick, setPick] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [raw, setRaw] = useState(false);
  const set = (e: Entry[], s = sideBySide) => onChange(serialize(e, s));
  const available = library.filter((m) => !entries.some((e) => e.file === m.name));

  function add(name: string) {
    if (!name || entries.some((e) => e.file === name)) return;
    set([...entries, { file: name, caption: "" }]);
    setPick("");
  }

  async function uploadFile(file: File) {
    setErr("");
    try {
      setProgress(0);
      const safe = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
      const blob = await upload(`assessments/${slug}/${safe}`, file, {
        access: "private",
        handleUploadUrl: "/api/admin/media/upload",
        clientPayload: slug,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      const r = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: file.name, pathname: blob.pathname, size: file.size }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Upload failed.");
      await onUploaded();
      if (!entries.some((e) => e.file === j.name)) set([...entries, { file: j.name, caption: "" }]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setProgress(null);
  }

  return (
    <div className="mf">
      <div className="mf-head small">
        <span>{label}</span>
        <button type="button" className="linkish small" onClick={() => setRaw(!raw)}>{raw ? "Picker view" : "Edit as text"}</button>
      </div>
      {raw ? (
        <textarea className="input mono" rows={3} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      ) : (
        <>
          {entries.length === 0 && <div className="small muted">None.</div>}
          {entries.map((e, i) => {
            const k = kindOf(e.file);
            const known = library.some((m) => m.name === e.file);
            return (
              <div key={e.file + i} className="mf-item">
                <div className="mf-thumb">
                  {k === "image" && known ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/asset/${slug}/${encodeURIComponent(e.file)}`} alt="" />
                  ) : (
                    <span>{k === "audio" ? "🔊" : k === "video" ? "▶" : "?"}</span>
                  )}
                </div>
                <div className="mf-body">
                  <div className="small"><code>{e.file}</code>{!known && <span className="bad"> · not uploaded yet</span>}</div>
                  <input className="input" placeholder="Caption (shown to candidates)" value={e.caption} aria-label={`Caption for ${e.file}`}
                    onChange={(ev) => set(entries.map((x, j) => (j === i ? { ...x, caption: ev.target.value } : x)))} />
                </div>
                <div className="mf-actions">
                  <button type="button" className="btn qb-btn" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...entries]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}>↑</button>
                  <button type="button" className="btn qb-btn" aria-label="Move down" disabled={i === entries.length - 1} onClick={() => { const n = [...entries]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }}>↓</button>
                  <button type="button" className="btn qb-btn" onClick={() => set(entries.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            );
          })}
          <div className="mf-add">
            <select className="input" value={pick} onChange={(e) => add(e.target.value)} aria-label={`Add a file to ${label}`}>
              <option value="">+ Add a file already uploaded…</option>
              {available.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
            <label className={`btn qb-btn mf-upload ${!canUpload || progress !== null ? "disabled" : ""}`} title={canUpload ? "" : "File storage isn't connected yet"}>
              {progress !== null ? `Uploading… ${progress}%` : "Upload new…"}
              <input type="file" hidden disabled={!canUpload || progress !== null}
                accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadFile(f); }} />
            </label>
          </div>
          {allowLayout && entries.filter((e) => kindOf(e.file) === "image").length > 1 && (
            <label className="small qe-inline"><input type="checkbox" checked={sideBySide} onChange={(e) => set(entries, e.target.checked)} /> Show the images side by side, each with a Zoom button</label>
          )}
          {err && <div className="notice notice-bad small">{err}</div>}
        </>
      )}
    </div>
  );
}

"use client";
import { normalizeDate } from "@/content/answers";
import { useCallback, useEffect, useState } from "react";
import MediaField, { type MediaItem } from "./MediaField";

// Edits one assessment's tab in the questions Sheet, one question (row) at a time.
// Saving writes to the Sheet; publishing still happens with the Publish button, as before.

type Cells = Record<string, string>;
type Row = { row: number; cells: Cells };
type Kind = "single" | "multi" | "text" | "date" | "grid";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const KIND_LABEL: Record<Kind, string> = {
  single: "Single choice",
  multi: "Check all that apply",
  text: "Typed answer",
  date: "Date (Month / Day / Year)",
  grid: "Grid (one choice per row)",
};

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const letters = (s: string) => s.toUpperCase().replace(/[^A-F]/g, "").split("");

function kindOf(c: Cells): Kind {
  if (lines(c["Rows"] ?? "").length) return "grid";
  const hasChoices = LETTERS.some((L) => (c[L] ?? "").trim());
  if (!hasChoices) return normalizeDate(lines(c["Correct"] ?? "")[0] ?? "") ? "date" : "text";
  return letters(c["Correct"] ?? "").length > 1 ? "multi" : "single";
}

function itemsOfRow(c: Cells): number {
  const n = lines(c["Rows"] ?? "").length;
  return n && /per\s*row/i.test(c["Scoring"] ?? "") ? n : 1;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

export default function QuestionEditor({ slug, title, onSaved }: { slug: string; title: string; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<{ row: number; mode: "edit" | "add" } | null>(null);
  const [filter, setFilter] = useState("");

  const [library, setLibrary] = useState<{ items: MediaItem[]; canUpload: boolean }>({ items: [], canUpload: false });
  const loadLibrary = useCallback(async () => {
    try {
      const r = await api<{ blobConfigured: boolean; assessments: { slug: string; items: MediaItem[] }[] }>("/api/admin/media");
      setLibrary({ items: r.assessments.find((a) => a.slug === slug)?.items ?? [], canUpload: r.blobConfigured });
    } catch {
      /* the picker still works with typed file names */
    }
  }, [slug]);
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ rows: Row[] }>(`/api/admin/questions/edit?slug=${slug}`);
      setRows(r.rows);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);

  async function saved(text: string) {
    setOpen(null);
    setMsg(text);
    await load();
    onSaved();
  }

  if (!rows) return <div className="qb-editor small muted">{err ? <span className="bad">{err}</span> : "Loading the questions from the Sheet…"}</div>;

  let n = 0;
  let section = "";
  return (
    <div className="qb-editor">
      <div className="notice notice-info small" style={{ marginBottom: 10 }}>
        Changes save straight to the <b>{title}</b> tab of the questions Sheet. Candidates see them only after you click <b>Publish</b>.
      </div>
      {msg && <div className="notice notice-good small" style={{ marginBottom: 10 }} role="status">{msg}</div>}
      {err && <div className="notice notice-bad small" style={{ marginBottom: 10 }} role="alert">{err}</div>}
      <input className="input" placeholder="Find a question…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} aria-label="Find a question" />
      {rows.map((r) => {
        const isQ = Boolean(r.cells["Question"].trim());
        const start = n + 1;
        if (isQ) n += itemsOfRow(r.cells);
        const label = isQ ? (itemsOfRow(r.cells) > 1 ? `${start}–${n}` : `${start}`) : "—";
        const newSection = r.cells["Section"].trim() && r.cells["Section"].trim() !== section;
        if (r.cells["Section"].trim()) section = r.cells["Section"].trim();
        const shown = !filter || JSON.stringify(r.cells).toLowerCase().includes(filter.toLowerCase());
        if (!shown) return null;
        return (
          <div key={r.row}>
            {newSection && <div className="qe-section">{section}</div>}
            {open?.row === r.row && open.mode === "edit" ? (
              <EditForm library={library} reloadLibrary={loadLibrary} slug={slug} row={r} sectionName={section} onCancel={() => setOpen(null)} onSaved={saved} />
            ) : (
              <div className="qe-line">
                <span className="qe-num">{label}</span>
                <span className="qe-text">{r.cells["Question"] || <i className="muted">(section details only)</i>}</span>
                <span className="qe-meta small muted">{isQ ? `${KIND_LABEL[kindOf(r.cells)]} · Correct: ${r.cells["Correct"].replace(/\n/g, " / ") || "—"}` : ""}</span>
                <span className="btn-row">
                  <button className="btn qb-btn" onClick={() => { setMsg(""); setErr(""); setOpen({ row: r.row, mode: "edit" }); }} disabled={Boolean(open)}>Edit</button>
                  <button className="btn qb-btn" onClick={() => { setMsg(""); setErr(""); setOpen({ row: r.row, mode: "add" }); }} disabled={Boolean(open)} title="Add a new question right after this one">+ Below</button>
                </span>
              </div>
            )}
            {open?.row === r.row && open.mode === "add" && (
              <EditForm library={library} reloadLibrary={loadLibrary} slug={slug} row={{ row: r.row, cells: {} }} adding sectionName={section} onCancel={() => setOpen(null)} onSaved={saved} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditForm({ library, reloadLibrary, slug, row, adding, sectionName, onCancel, onSaved }: { library: { items: MediaItem[]; canUpload: boolean }; reloadLibrary: () => Promise<void>; slug: string; row: Row; adding?: boolean; sectionName: string; onCancel: () => void; onSaved: (msg: string) => void }) {
  const c = row.cells;
  const get = (h: string) => c[h] ?? "";
  const [kind, setKind] = useState<Kind>(adding ? "single" : kindOf(c));
  const [prompt, setPrompt] = useState(get("Question"));
  const [choices, setChoices] = useState(LETTERS.map((L) => get(L)));
  const [single, setSingle] = useState(letters(get("Correct"))[0] ?? "");
  const [multi, setMulti] = useState<string[]>(letters(get("Correct")));
  const [gridRows, setGridRows] = useState(get("Rows"));
  const [gridAns, setGridAns] = useState<string[]>(letters(get("Correct")));
  const [accepted, setAccepted] = useState(kindOf(c) === "text" ? get("Correct") : "");
  const iso = normalizeDate(lines(get("Correct"))[0] ?? "");
  const [date, setDate] = useState(kindOf(c) === "date" && iso ? iso : "");
  const scoring = get("Scoring");
  const [perRow, setPerRow] = useState(adding ? true : /per\s*row/i.test(scoring));
  const [points, setPoints] = useState(/^\s*\d/.test(scoring) ? String(parseFloat(scoring)) : "1");
  const [qMedia, setQMedia] = useState(get("Question Media"));
  const firstOfSection = !adding && Boolean(get("Section").trim());
  const [sec, setSec] = useState({ s: get("Section"), d: get("Section Description"), m: get("Section Media") });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const usesChoices = kind === "single" || kind === "multi" || kind === "grid";
  const filled = LETTERS.filter((_, i) => choices[i].trim());
  const rowList = lines(gridRows);

  function build(): Cells {
    const v: Cells = { Question: prompt };
    LETTERS.forEach((L, i) => (v[L] = usesChoices ? choices[i] : ""));
    v["Rows"] = kind === "grid" ? rowList.join("\n") : "";
    if (kind === "single") v["Correct"] = single;
    if (kind === "multi") v["Correct"] = LETTERS.filter((L) => multi.includes(L)).join(", ");
    if (kind === "grid") v["Correct"] = rowList.map((_, i) => gridAns[i] ?? "").join(", ");
    if (kind === "text") v["Correct"] = lines(accepted).join("\n");
    if (kind === "date") {
      const [y, m, d] = date.split("-");
      v["Correct"] = date ? `${m}/${d}/${y}` : "";
    }
    const p = Number(points);
    v["Scoring"] = kind === "grid" ? (perRow ? "Per row" : "") : p && p !== 1 ? String(p) : "";
    v["Question Media"] = qMedia;
    if (firstOfSection) {
      v["Section"] = sec.s;
      v["Section Description"] = sec.d;
      v["Section Media"] = sec.m;
    }
    return v;
  }

  async function save(op: "update" | "insert" | "delete") {
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin/questions/edit", {
        method: "POST",
        body: JSON.stringify({ slug, op, row: row.row, before: adding ? {} : c, values: op === "delete" ? {} : build() }),
      });
      onSaved(op === "delete" ? "Question deleted from the Sheet." : op === "insert" ? "Question added to the Sheet." : "Saved to the Sheet.");
    } catch (e) {
      setErr((e as Error).message);
      setConfirmDelete(false);
    }
    setBusy(false);
  }

  return (
    <div className="qe-form">
      <div className="qe-form-head">
        <b>{adding ? "New question" : "Edit question"}</b>
        <span className="small muted">Section: {sectionName}{adding ? " (added after the question above)" : ""}</span>
      </div>

      {firstOfSection && (
        <details className="qe-details">
          <summary className="small">Section details (name, description, media)</summary>
          <label className="small">Section name<input className="input" value={sec.s} onChange={(e) => setSec({ ...sec, s: e.target.value })} /></label>
          <label className="small">Section description<textarea className="input" rows={3} value={sec.d} onChange={(e) => setSec({ ...sec, d: e.target.value })} /></label>
          <MediaField label="Section media (shown at the top of the section)" slug={slug} value={sec.m} onChange={(m) => setSec({ ...sec, m })}
            library={library.items} canUpload={library.canUpload} onUploaded={reloadLibrary} allowLayout />
        </details>
      )}

      <label className="small">Question type
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>

      <label className="small">Question<textarea className="input" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>

      {usesChoices && (
        <fieldset className="qe-choices">
          <legend className="small">
            {kind === "grid" ? "Columns (e.g. Priority 1, Priority 2…)" : kind === "multi" ? "Choices — tick every correct one" : "Choices — pick the correct one"}
          </legend>
          {LETTERS.map((L, i) => (i === 0 || choices[i - 1].trim() || choices[i].trim()) && (
            <div key={L} className="qe-choice">
              {kind === "single" && <input type="radio" name={`c-${row.row}`} aria-label={`${L} is correct`} checked={single === L} onChange={() => setSingle(L)} disabled={!choices[i].trim()} />}
              {kind === "multi" && <input type="checkbox" aria-label={`${L} is correct`} checked={multi.includes(L)} onChange={(e) => setMulti(e.target.checked ? [...multi, L] : multi.filter((x) => x !== L))} disabled={!choices[i].trim()} />}
              {kind === "grid" && <span />}
              <b className="qb-letter">{L}</b>
              <textarea className="input" rows={1} value={choices[i]} placeholder={i >= 2 ? "(optional)" : ""} onChange={(e) => setChoices(choices.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Choice ${L}`} />
            </div>
          ))}
        </fieldset>
      )}

      {kind === "grid" && (
        <>
          <label className="small">Rows (one per line)<textarea className="input" rows={Math.max(3, rowList.length + 1)} value={gridRows} onChange={(e) => setGridRows(e.target.value)} /></label>
          {rowList.length > 0 && (
            <div className="qe-gridkey">
              <div className="small"><b>Correct column for each row</b></div>
              {rowList.map((r, i) => (
                <label key={i} className="small qe-gridrow">
                  <span>{i + 1}. {r}</span>
                  <select className="input" value={gridAns[i] ?? ""} onChange={(e) => setGridAns(rowList.map((_, k) => (k === i ? e.target.value : gridAns[k] ?? "")))}>
                    <option value="">—</option>
                    {filled.map((L) => <option key={L} value={L}>{choices[LETTERS.indexOf(L)]}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <label className="small qe-inline"><input type="checkbox" checked={perRow} onChange={(e) => setPerRow(e.target.checked)} /> 1 point per row (each row numbered as its own question). Untick for 1 point, all rows must be right.</label>
        </>
      )}

      {kind === "text" && (
        <label className="small">Accepted answers (one per line; case, spacing and punctuation don’t matter)
          <textarea className="input" rows={3} value={accepted} onChange={(e) => setAccepted(e.target.value)} />
        </label>
      )}
      {kind === "date" && (
        <label className="small">Correct date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      )}

      {kind !== "grid" && (
        <label className="small qe-points">Points
          <input className="input" type="number" min={1} max={20} value={points} onChange={(e) => setPoints(e.target.value)} />
        </label>
      )}

      <MediaField label="Question media (shown with this question)" slug={slug} value={qMedia} onChange={setQMedia}
        library={library.items} canUpload={library.canUpload} onUploaded={reloadLibrary} />

      {err && <div className="notice notice-bad small" role="alert">{err}</div>}

      <div className="btn-row" style={{ justifyContent: "space-between" }}>
        <span>
          {!adding && (confirmDelete ? (
            <span className="btn-row">
              <span className="small">Delete this question from the Sheet?</span>
              <button className="btn qb-btn btn-danger" onClick={() => save("delete")} disabled={busy}>Yes, delete</button>
              <button className="btn qb-btn" onClick={() => setConfirmDelete(false)} disabled={busy}>No</button>
            </span>
          ) : (
            <button className="btn qb-btn" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete…</button>
          ))}
        </span>
        <span className="btn-row">
          <button className="btn qb-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-primary qb-btn" onClick={() => save(adding ? "insert" : "update")} disabled={busy || !prompt.trim()}>{busy ? "Saving…" : "Save to Sheet"}</button>
        </span>
      </div>
    </div>
  );
}

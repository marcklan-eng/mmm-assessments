"use client";
import { normalizeDate } from "@/content/answers";
import { useCallback, useEffect, useState } from "react";
import MediaField, { type MediaItem } from "./MediaField";

// Edits one assessment's tab in the questions Sheet, one question (row) at a time.
// Saving writes to the Sheet; publishing still happens with the Publish button, as before.

type Cells = Record<string, string>;
type Row = { row: number; cells: Cells };
type Kind = "single" | "truefalse" | "dropdown" | "multi" | "text" | "number" | "date" | "blanks" | "order" | "match" | "grid";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const KIND_LABEL: Record<Kind, string> = {
  single: "Single choice",
  truefalse: "True / False",
  dropdown: "Dropdown (single choice from a list)",
  multi: "Check all that apply",
  text: "Typed answer",
  number: "Number answer (amounts, totals…)",
  date: "Date (Month / Day / Year)",
  blanks: "Fill in the blanks",
  order: "Put in order",
  match: "Matching (dropdown for each item)",
  grid: "Grid (one choice per row)",
};
const TYPE_CELL: Partial<Record<Kind, string>> = { truefalse: "True/False", dropdown: "Dropdown", number: "Number", blanks: "Fill in the blanks", order: "Put in order", match: "Matching" };
const BLANKS = /_{3,}|\[blank\]/gi;

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const letters = (s: string) => s.toUpperCase().replace(/[^A-F]/g, "").split("");

function kindOf(c: Cells): Kind {
  const t = (c["Type"] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["putinorder", "order", "ordering", "ranking", "rank", "sequence"].includes(t)) return "order";
  if (["number", "numeric", "numberanswer", "amount"].includes(t)) return "number";
  if (["dropdown", "select", "dropdownlist"].includes(t)) return "dropdown";
  if (["matching", "match"].includes(t)) return "match";
  if (["fillintheblanks", "fillintheblank", "blanks", "blank", "fillin"].includes(t)) return "blanks";
  if (["truefalse", "tf"].includes(t)) return "truefalse";
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

export default function QuestionEditor({ slug, title, onSaved, refreshedAt }: { slug: string; title: string; onSaved: () => void; refreshedAt?: number | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<{ row: number; mode: "edit" | "add" | "section" } | null>(null);
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

  useEffect(() => {
    if (refreshedAt && !open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshedAt]);

  async function saved(text: string) {
    setOpen(null);
    setMsg(text);
    await load();
    onSaved();
  }

  if (!rows) return <div className="qb-editor small muted">{err ? <span className="bad">{err}</span> : "Loading the questions from the Sheet…"}</div>;

  let n = 0;
  let section = "";
  const sectionNames = [...new Set(rows.map((r) => r.cells["Section"].trim()).filter(Boolean))];
  return (
    <div className="qb-editor">
      <div className="notice notice-info small" style={{ marginBottom: 10 }}>
        Changes save straight to the <b>{title}</b> tab of the questions Sheet. Candidates see them only after you click <b>Publish</b>.
      </div>
      {msg && <div className="notice notice-good small" style={{ marginBottom: 10 }} role="status">{msg}</div>}
      {err && <div className="notice notice-bad small" style={{ marginBottom: 10 }} role="alert">{err}</div>}
      <input className="input" placeholder="Find a question…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} aria-label="Find a question" />
      {rows.map((r, idx) => {
        const isQ = Boolean(r.cells["Question"].trim());
        const start = n + 1;
        if (isQ) n += itemsOfRow(r.cells);
        const label = isQ ? (itemsOfRow(r.cells) > 1 ? `${start}–${n}` : `${start}`) : "—";
        const newSection = r.cells["Section"].trim() && r.cells["Section"].trim() !== section;
        if (r.cells["Section"].trim()) section = r.cells["Section"].trim();
        const nextSec = rows[idx + 1]?.cells["Section"].trim();
        const lastOfSection = idx === rows.length - 1 || Boolean(nextSec && nextSec !== section);
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
            {lastOfSection && !filter && (open?.row === r.row && open.mode === "section" ? (
              <EditForm library={library} reloadLibrary={loadLibrary} slug={slug} row={{ row: r.row, cells: {} }} adding newSection
                sectionNames={sectionNames} sectionName={section} onCancel={() => setOpen(null)} onSaved={saved} />
            ) : (
              <button className="qe-addsec" onClick={() => { setMsg(""); setErr(""); setOpen({ row: r.row, mode: "section" }); }} disabled={Boolean(open)}>
                + New section after “{section}”
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EditForm({ library, reloadLibrary, slug, row, adding, newSection, sectionNames = [], sectionName, onCancel, onSaved }: { library: { items: MediaItem[]; canUpload: boolean }; reloadLibrary: () => Promise<void>; slug: string; row: Row; adding?: boolean; newSection?: boolean; sectionNames?: string[]; sectionName: string; onCancel: () => void; onSaved: (msg: string) => void }) {
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
  const k0 = adding ? "single" : kindOf(c);
  const [orderAns, setOrderAns] = useState<string[]>(k0 === "order" ? letters(get("Correct")) : []);
  const num0 = (lines(get("Correct"))[0] ?? "").split(/±|\+\/-|\+-/);
  const [numAns, setNumAns] = useState(k0 === "number" ? (num0[0] ?? "").trim() : "");
  const [numTol, setNumTol] = useState(k0 === "number" ? (num0[1] ?? "").trim() : "");
  const [blankAns, setBlankAns] = useState<string[]>(k0 === "blanks" ? get("Correct").split("\n") : []);
  const [partial, setPartial] = useState(/per\s*(item|blank)|partial/i.test(get("Scoring")));
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

  const usesChoices = ["single", "truefalse", "dropdown", "multi", "grid", "order", "match"].includes(kind);
  const pickOne = kind === "single" || kind === "dropdown" || kind === "truefalse";
  const isGrid = kind === "grid" || kind === "match";
  const filled = LETTERS.filter((_, i) => choices[i].trim());
  const rowList = lines(gridRows);
  const orderList = [...orderAns.filter((L) => filled.includes(L)), ...filled.filter((L) => !orderAns.includes(L))];
  const blankN = (prompt.match(BLANKS) ?? []).length;
  const pointsCell = Number(points) && Number(points) !== 1 ? String(Number(points)) : "";

  function changeKind(k: Kind) {
    if (k === "truefalse") setChoices(["True", "False", "", "", "", ""]);
    else if (kind === "truefalse") setChoices(LETTERS.map(() => ""));
    setKind(k);
  }

  function build(): Cells {
    const v: Cells = { Question: prompt };
    LETTERS.forEach((L, i) => (v[L] = usesChoices ? choices[i] : ""));
    v["Type"] = TYPE_CELL[kind] ?? "";
    v["Rows"] = isGrid ? rowList.join("\n") : "";
    if (pickOne) v["Correct"] = single;
    if (kind === "multi") v["Correct"] = LETTERS.filter((L) => multi.includes(L)).join(", ");
    if (isGrid) v["Correct"] = rowList.map((_, i) => gridAns[i] ?? "").join(", ");
    if (kind === "order") v["Correct"] = orderList.join(", ");
    if (kind === "number") v["Correct"] = numAns.trim() ? (numTol.trim() ? `${numAns.trim()} ± ${numTol.trim()}` : numAns.trim()) : "";
    if (kind === "blanks") v["Correct"] = Array.from({ length: blankN }, (_, i) => (blankAns[i] ?? "").trim()).join("\n");
    if (kind === "text") v["Correct"] = lines(accepted).join("\n");
    if (kind === "date") {
      const [y, m, d] = date.split("-");
      v["Correct"] = date ? `${m}/${d}/${y}` : "";
    }
    v["Scoring"] = isGrid ? (perRow ? "Per row" : "") : (kind === "order" || kind === "blanks") && partial ? "Per item" : pointsCell;
    v["Question Media"] = qMedia;
    if (firstOfSection || newSection) {
      v["Section"] = sec.s;
      v["Section Description"] = sec.d;
      v["Section Media"] = sec.m;
    }
    return v;
  }

  async function save(op: "update" | "insert" | "delete") {
    if (newSection) {
      if (!sec.s.trim()) return setErr("Give the new section a name.");
      if (sectionNames.some((x) => x.toLowerCase() === sec.s.trim().toLowerCase())) return setErr(`There is already a section called “${sec.s.trim()}”. Use a different name.`);
    }
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin/questions/edit", {
        method: "POST",
        body: JSON.stringify({ slug, op, row: row.row, before: adding ? {} : c, values: op === "delete" ? {} : build() }),
      });
      onSaved(op === "delete" ? "Question deleted from the Sheet." : newSection ? `Section “${sec.s.trim()}” added to the Sheet with its first question. Use + Below to add more questions to it.` : op === "insert" ? "Question added to the Sheet." : "Saved to the Sheet.");
    } catch (e) {
      setErr((e as Error).message);
      setConfirmDelete(false);
    }
    setBusy(false);
  }

  return (
    <div className="qe-form">
      <div className="qe-form-head">
        <b>{newSection ? "New section" : adding ? "New question" : "Edit question"}</b>
        <span className="small muted">{newSection ? `Added after “${sectionName}”` : `Section: ${sectionName}${adding ? " (added after the question above)" : ""}`}</span>
      </div>

      {newSection && (
        <div className="qe-newsec">
          <label className="small">Section name (the skill, e.g. “Insurance Verification”)<input className="input" value={sec.s} onChange={(e) => setSec({ ...sec, s: e.target.value })} /></label>
          <label className="small">Section description (instructions shown at the top of the section)<textarea className="input" rows={3} value={sec.d} onChange={(e) => setSec({ ...sec, d: e.target.value })} /></label>
          <MediaField label="Section media (optional, shown at the top of the section)" slug={slug} value={sec.m} onChange={(m) => setSec({ ...sec, m })}
            library={library.items} canUpload={library.canUpload} onUploaded={reloadLibrary} allowLayout />
          <div className="small"><b>First question of this section</b></div>
        </div>
      )}

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
        <select className="input" value={kind} onChange={(e) => changeKind(e.target.value as Kind)}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>

      <label className="small">Question<textarea className="input" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      {kind === "blanks" && (
        <div className="small muted">Type ___ (three underscores) in the question wherever a blank goes. {blankN ? `This question has ${blankN} blank${blankN === 1 ? "" : "s"}.` : "No blanks yet."}</div>
      )}

      {usesChoices && (
        <fieldset className="qe-choices">
          <legend className="small">
            {kind === "grid" ? "Columns (e.g. Priority 1, Priority 2…)" : kind === "match" ? "Answers to choose from (each item picks one)" : kind === "order" ? "Items, in the order candidates first see them (mix them up)" : kind === "multi" ? "Choices — tick every correct one" : "Choices — pick the correct one"}
          </legend>
          {LETTERS.map((L, i) => (i === 0 || choices[i - 1].trim() || choices[i].trim()) && !(kind === "truefalse" && i > 1) && (
            <div key={L} className="qe-choice">
              {pickOne && <input type="radio" name={`c-${row.row}`} aria-label={`${L} is correct`} checked={single === L} onChange={() => setSingle(L)} disabled={!choices[i].trim()} />}
              {kind === "multi" && <input type="checkbox" aria-label={`${L} is correct`} checked={multi.includes(L)} onChange={(e) => setMulti(e.target.checked ? [...multi, L] : multi.filter((x) => x !== L))} disabled={!choices[i].trim()} />}
              {(isGrid || kind === "order") && <span />}
              <b className="qb-letter">{L}</b>
              <textarea className="input" rows={1} readOnly={kind === "truefalse"} value={choices[i]} placeholder={i >= 2 ? "(optional)" : ""} onChange={(e) => setChoices(choices.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Choice ${L}`} />
            </div>
          ))}
        </fieldset>
      )}

      {kind === "order" && orderList.length > 1 && (
        <div className="qe-gridkey">
          <div className="small"><b>Correct order</b> (first at the top)</div>
          {orderList.map((L, i) => (
            <div key={L} className="small qe-orderrow">
              <span className="qe-ordernum">{i + 1}</span>
              <span>{choices[LETTERS.indexOf(L)]}</span>
              <span className="btn-row">
                <button type="button" className="btn qb-btn" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...orderList]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setOrderAns(n); }}>↑</button>
                <button type="button" className="btn qb-btn" aria-label="Move down" disabled={i === orderList.length - 1} onClick={() => { const n = [...orderList]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setOrderAns(n); }}>↓</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {(kind === "order" || kind === "blanks") && (
        <label className="small qe-inline"><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Partial credit: 1 point for each {kind === "order" ? "item in the right place" : "blank answered right"}. Untick for all-or-nothing.</label>
      )}
      {kind === "number" && (
        <div className="filters" style={{ marginTop: 0 }}>
          <label className="small field">Correct number<input className="input" inputMode="decimal" placeholder="e.g. 125.40" value={numAns} onChange={(e) => setNumAns(e.target.value)} /></label>
          <label className="small field">Allowed difference (optional)<input className="input" inputMode="decimal" placeholder="e.g. 0.01" value={numTol} onChange={(e) => setNumTol(e.target.value)} /></label>
        </div>
      )}
      {kind === "number" && <div className="small muted">Candidates can type $ signs and commas (e.g. $1,250.00); they’re ignored.</div>}
      {kind === "blanks" && blankN > 0 && (
        <div className="qe-gridkey">
          <div className="small"><b>Correct answer for each blank</b> (separate other accepted answers with |, e.g. CO-45 | CO 45)</div>
          {Array.from({ length: blankN }, (_, i) => (
            <label key={i} className="small qe-gridrow">
              <span>Blank {i + 1}</span>
              <input className="input" value={blankAns[i] ?? ""} onChange={(e) => setBlankAns(Array.from({ length: Math.max(blankN, blankAns.length) }, (_, k) => (k === i ? e.target.value : blankAns[k] ?? "")))} />
            </label>
          ))}
        </div>
      )}

      {isGrid && (
        <>
          <label className="small">{kind === "match" ? "Items to match (one per line)" : "Rows (one per line)"}<textarea className="input" rows={Math.max(3, rowList.length + 1)} value={gridRows} onChange={(e) => setGridRows(e.target.value)} /></label>
          {rowList.length > 0 && (
            <div className="qe-gridkey">
              <div className="small"><b>{kind === "match" ? "Correct answer for each item" : "Correct column for each row"}</b></div>
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

      {!isGrid && !((kind === "order" || kind === "blanks") && partial) && (
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

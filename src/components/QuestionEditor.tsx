"use client";
import { normalizeDate } from "@/content/answers";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** One readable line about the answer key, for the question list. */
function summary(c: Cells): string {
  const k = kindOf(c);
  const t = (L: string) => (c[L] ?? "").trim();
  const ls = letters(c["Correct"] ?? "");
  const short = (x: string) => (x.length > 40 ? x.slice(0, 38) + "…" : x);
  if (k === "match" || k === "grid") return `${lines(c["Rows"] ?? "").length} ${k === "match" ? "pairs" : "rows"}`;
  if (k === "order") return `${ls.length} steps · first: ${short(t(ls[0] ?? ""))}`;
  if (k === "blanks") return `Answers: ${(c["Correct"] ?? "").split("\n").map((l) => l.split("|")[0].trim()).join(", ")}`;
  if (k === "single" || k === "dropdown" || k === "truefalse" || k === "multi") return `Correct: ${ls.map((L) => short(t(L))).join("; ") || "—"}`;
  return `Correct: ${(c["Correct"] ?? "").replace(/\n/g, " or ") || "—"}`;
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
                <span className="qe-meta small muted">{isQ ? `${KIND_LABEL[kindOf(r.cells)]} · ${summary(r.cells)}` : ""}</span>
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

const HELP: Record<Kind, string> = {
  single: "Candidates pick one answer (round buttons).",
  truefalse: "Candidates pick True or False.",
  dropdown: "Candidates pick one answer from a dropdown list. Good for long lists, such as codes.",
  multi: "Candidates tick every answer that applies. They get the points only when exactly the correct ones are ticked.",
  text: "Candidates type a short answer. Capital letters, spacing and punctuation don’t matter.",
  number: "Candidates type a number. $ signs and commas are ignored, e.g. $1,250.00 = 1250.",
  date: "Candidates pick Month / Day / Year from dropdowns.",
  blanks: "Candidates fill in each blank in the question.",
  order: "Candidates see the steps mixed up and use arrows to put them in the right order.",
  match: "Candidates see each item with a dropdown of all the answers and pick the one that matches.",
  grid: "Candidates see a table and pick one column in each row (like a Google Form grid).",
};

/** Mixes up n items so they never start in the right order: 2nd, 4th, 6th… then 1st, 3rd, 5th… */
function scramble<T>(xs: T[]): T[] {
  return [...xs.filter((_, i) => i % 2 === 1), ...xs.filter((_, i) => i % 2 === 0)];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const MAX = 6;

/** Small list editor: text inputs with ✕ and "+ Add". */
function ListInputs({ items, onChange, addLabel, placeholder, max = MAX, numbered, reorder, ariaLabel }: {
  items: string[]; onChange: (v: string[]) => void; addLabel: string; placeholder?: string; max?: number; numbered?: boolean; reorder?: boolean; ariaLabel: string;
}) {
  const set = (i: number, v: string) => onChange(items.map((x, k) => (k === i ? v : x)));
  const swap = (i: number, j: number) => { const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="qe-list">
      {items.map((t, i) => (
        <div key={i} className="qe-list-row">
          {numbered && <span className="qe-ordernum">{i + 1}</span>}
          <input className="input" value={t} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} aria-label={`${ariaLabel} ${i + 1}`} />
          {reorder && <>
            <button type="button" className="btn qb-btn" aria-label="Move up" disabled={i === 0} onClick={() => swap(i, i - 1)}>↑</button>
            <button type="button" className="btn qb-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => swap(i, i + 1)}>↓</button>
          </>}
          <button type="button" className="btn qb-btn" aria-label={`Remove ${ariaLabel} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      {items.length < max && <button type="button" className="btn qb-btn qe-add" onClick={() => onChange([...items, ""])}>{addLabel}</button>}
    </div>
  );
}

function EditForm({ library, reloadLibrary, slug, row, adding, newSection, sectionNames = [], sectionName, onCancel, onSaved }: { library: { items: MediaItem[]; canUpload: boolean }; reloadLibrary: () => Promise<void>; slug: string; row: Row; adding?: boolean; newSection?: boolean; sectionNames?: string[]; sectionName: string; onCancel: () => void; onSaved: (msg: string) => void }) {
  const c = row.cells;
  const get = (h: string) => c[h] ?? "";
  const k0: Kind = adding ? "single" : kindOf(c);
  const [kind, setKind] = useState<Kind>(k0);
  const [prompt, setPrompt] = useState(get("Question"));
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // What the Sheet holds now (used to set up each builder).
  const filledL = LETTERS.filter((L) => get(L).trim());
  const textOf = (L: string) => get(L).trim();
  const correctL = letters(get("Correct"));
  const rowsNow = lines(get("Rows"));

  // Choices (single / true-false / dropdown / check all)
  const [choices, setChoices] = useState<{ text: string; correct: boolean }[]>(() =>
    ["single", "truefalse", "dropdown", "multi"].includes(k0) && filledL.length
      ? filledL.map((L) => ({ text: textOf(L), correct: correctL.includes(L) }))
      : [{ text: "", correct: false }, { text: "", correct: false }],
  );
  // Grid
  const [gridCols, setGridCols] = useState<string[]>(() => (k0 === "grid" ? filledL.map(textOf) : ["", ""]));
  const [gridRowsS, setGridRowsS] = useState<{ text: string; col: number }[]>(() =>
    k0 === "grid" ? rowsNow.map((t, i) => ({ text: t, col: filledL.indexOf(correctL[i] ?? "") })) : [{ text: "", col: -1 }],
  );
  // Matching
  const initPairs = k0 === "match" ? rowsNow.map((t, i) => ({ item: t, answer: correctL[i] ? textOf(correctL[i]) : "" })) : [{ item: "", answer: "" }, { item: "", answer: "" }];
  const initExtras = k0 === "match" ? filledL.filter((L) => !correctL.includes(L)).map(textOf) : [];
  const [pairs, setPairs] = useState(initPairs);
  const [extras, setExtras] = useState<string[]>(initExtras);
  // Put in order (typed in the correct order)
  const initSteps = k0 === "order" && correctL.length === filledL.length ? correctL.map(textOf) : k0 === "order" ? filledL.map(textOf) : ["", "", ""];
  const [steps, setSteps] = useState<string[]>(initSteps);
  // Typed / number / date / blanks
  const [accepted, setAccepted] = useState<string[]>(() => (k0 === "text" ? lines(get("Correct")) : [""]));
  const num0 = (lines(get("Correct"))[0] ?? "").split(/±|\+\/-|\+-/);
  const [numAns, setNumAns] = useState(k0 === "number" ? (num0[0] ?? "").trim() : "");
  const [numTol, setNumTol] = useState(k0 === "number" ? (num0[1] ?? "").trim() : "");
  const iso = normalizeDate(lines(get("Correct"))[0] ?? "");
  const [date, setDate] = useState(k0 === "date" && iso ? iso : "");
  const [blankAns, setBlankAns] = useState<string[][]>(() => (k0 === "blanks" ? get("Correct").split("\n").map((l) => l.split("|").map((x) => x.trim())) : []));
  // Scoring
  const scoring = get("Scoring");
  const [perRow, setPerRow] = useState(adding ? true : /per\s*row/i.test(scoring));
  const [partial, setPartial] = useState(adding ? true : /per\s*(item|blank)|partial/i.test(scoring));
  const [points, setPoints] = useState(/^\s*\d/.test(scoring) ? String(parseFloat(scoring)) : "1");
  // Media / section
  const [qMedia, setQMedia] = useState(get("Question Media"));
  const firstOfSection = !adding && Boolean(get("Section").trim());
  const [sec, setSec] = useState({ s: get("Section"), d: get("Section Description"), m: get("Section Media") });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pickOne = kind === "single" || kind === "dropdown" || kind === "truefalse";
  const blankParts = prompt.split(BLANKS);
  const blankN = blankParts.length - 1;
  const pointsCell = Number(points) && Number(points) !== 1 ? String(Number(points)) : "";

  function changeKind(k: Kind) {
    if (k === "truefalse") setChoices([{ text: "True", correct: choices[0]?.correct ?? false }, { text: "False", correct: choices[1]?.correct ?? false }]);
    else if (kind === "truefalse") setChoices([{ text: "", correct: false }, { text: "", correct: false }]);
    if ((k === "single" || k === "dropdown" || k === "truefalse") && choices.filter((x) => x.correct).length > 1) {
      setChoices((cs) => cs.map((x, i) => ({ ...x, correct: i === cs.findIndex((y) => y.correct) })));
    }
    setKind(k);
  }

  function insertBlank() {
    const el = promptRef.current;
    const at = el && document.activeElement === el ? el.selectionStart : el?.dataset.caret ? Number(el.dataset.caret) : prompt.length;
    const head = prompt.slice(0, at);
    const ins = `${head.endsWith(" ") || !at ? "" : " "}___ `;
    const next = `${head}${ins}${prompt.slice(at).replace(/^ /, "")}`;
    const caret = head.length + ins.length;
    setPrompt(next);
    // Put the cursor right after the new blank so you can keep typing.
    setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      el.dataset.caret = String(caret);
    }, 0);
  }

  /** Turns the builders into the Sheet's columns. Returns an error message instead when something's missing. */
  function build(): Cells | string {
    const v: Cells = { Question: prompt.trim() };
    LETTERS.forEach((L) => (v[L] = ""));
    v["Type"] = TYPE_CELL[kind] ?? "";
    v["Rows"] = "";
    v["Correct"] = "";
    const put = (texts: string[]) => texts.forEach((t, i) => (v[LETTERS[i]] = t));
    if (pickOne || kind === "multi") {
      const cs = choices.filter((x) => x.text.trim());
      if (cs.length < 2) return "Add at least 2 choices.";
      if (cs.length > MAX) return `Up to ${MAX} choices.`;
      if (!cs.some((x) => x.correct)) return "Mark the correct answer.";
      put(cs.map((x) => x.text.trim()));
      v["Correct"] = cs.map((x, i) => (x.correct ? LETTERS[i] : "")).filter(Boolean).join(", ");
    }
    if (kind === "grid") {
      const cols = gridCols.map((x) => x.trim()).filter(Boolean);
      const rs = gridRowsS.filter((x) => x.text.trim());
      if (cols.length < 2) return "Add at least 2 column headings.";
      if (rs.length < 2) return "Add at least 2 rows.";
      if (rs.some((x) => x.col < 0 || !gridCols[x.col]?.trim())) return "Click the correct column in every row.";
      put(cols);
      v["Rows"] = rs.map((x) => x.text.trim()).join("\n");
      v["Correct"] = rs.map((x) => LETTERS[cols.indexOf(gridCols[x.col].trim())]).join(", ");
    }
    if (kind === "match") {
      const ps = pairs.map((p) => ({ item: p.item.trim(), answer: p.answer.trim() })).filter((p) => p.item || p.answer);
      if (ps.length < 2) return "Add at least 2 pairs.";
      if (ps.some((p) => !p.item || !p.answer)) return "Every pair needs an item and its correct match.";
      const unchanged = same(ps, initPairs) && same(extras.map((x) => x.trim()).filter(Boolean), initExtras);
      let answers = [...new Set([...ps.map((p) => p.answer), ...extras.map((x) => x.trim()).filter(Boolean)])];
      if (answers.length > MAX) return `Matching can have up to ${MAX} different answers (yours has ${answers.length}). Items can share an answer.`;
      if (unchanged) answers = filledL.map(textOf); // keep the order already in the Sheet
      else answers.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
      put(answers);
      v["Rows"] = ps.map((p) => p.item).join("\n");
      v["Correct"] = ps.map((p) => LETTERS[answers.indexOf(p.answer)]).join(", ");
    }
    if (kind === "order") {
      const st = steps.map((x) => x.trim()).filter(Boolean);
      if (st.length < 2) return "Add at least 2 steps.";
      if (st.length > MAX) return `Up to ${MAX} steps.`;
      if (new Set(st).size !== st.length) return "Two steps have the same text.";
      const shown = same(st, initSteps) && k0 === "order" ? filledL.map(textOf) : scramble(st);
      put(shown);
      v["Correct"] = st.map((t) => LETTERS[shown.indexOf(t)]).join(", ");
    }
    if (kind === "text") {
      const a = accepted.map((x) => x.trim()).filter(Boolean);
      if (!a.length) return "Type the correct answer.";
      v["Correct"] = a.join("\n");
    }
    if (kind === "number") {
      if (!numAns.trim()) return "Type the correct number.";
      v["Correct"] = numTol.trim() ? `${numAns.trim()} ± ${numTol.trim()}` : numAns.trim();
    }
    if (kind === "date") {
      if (!date) return "Pick the correct date.";
      const [y, m, d] = date.split("-");
      v["Correct"] = `${m}/${d}/${y}`;
    }
    if (kind === "blanks") {
      if (!blankN) return "Add at least one blank to the question (Insert blank).";
      const a = Array.from({ length: blankN }, (_, i) => (blankAns[i] ?? [""]).map((x) => x.trim()).filter(Boolean));
      if (a.some((x) => !x.length)) return "Type the correct answer for every blank.";
      v["Correct"] = a.map((x) => x.join(" | ")).join("\n");
    }
    const grid = kind === "grid" || kind === "match";
    v["Scoring"] = grid ? (perRow ? "Per row" : "") : (kind === "order" || kind === "blanks") && partial ? "Per item" : pointsCell;
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
    const values = op === "delete" ? {} : build();
    if (typeof values === "string") return setErr(values);
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin/questions/edit", {
        method: "POST",
        body: JSON.stringify({ slug, op, row: row.row, before: adding ? {} : c, values }),
      });
      onSaved(op === "delete" ? "Question deleted from the Sheet." : newSection ? `Section “${sec.s.trim()}” added to the Sheet with its first question. Use + Below to add more questions to it.` : op === "insert" ? "Question added to the Sheet." : "Saved to the Sheet.");
    } catch (e) {
      setErr((e as Error).message);
      setConfirmDelete(false);
    }
    setBusy(false);
  }

  const showPoints = !(kind === "grid" || kind === "match") && !((kind === "order" || kind === "blanks") && partial);

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

      <div>
        <label className="small">Question type
          <select className="input" value={kind} onChange={(e) => changeKind(e.target.value as Kind)}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <div className="qe-help small">{HELP[kind]}</div>
      </div>

      <label className="small">{kind === "match" ? "Question / instructions (e.g. “Match each denial code to its meaning.”)" : kind === "order" ? "Question / instructions (e.g. “Put the claim steps in order.”)" : "Question"}
        <textarea ref={promptRef} className="input" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onSelect={(e) => { e.currentTarget.dataset.caret = String(e.currentTarget.selectionStart); }} />
      </label>

      {/* ---- Choices ---- */}
      {(pickOne || kind === "multi") && (
        <div className="qe-block">
          <div className="small qe-block-title">{kind === "multi" ? "Choices: tick every correct answer" : "Choices: mark the correct answer"}</div>
          {choices.map((ch, i) => (
            <div key={i} className={`qe-choice-row ${ch.correct ? "is-correct" : ""}`}>
              <label className="qe-correct">
                <input
                  type={kind === "multi" ? "checkbox" : "radio"}
                  name={`correct-${row.row}`}
                  checked={ch.correct}
                  aria-label={`${LETTERS[i]} is correct`}
                  onChange={(e) => setChoices(choices.map((x, k) => (kind === "multi" ? (k === i ? { ...x, correct: e.target.checked } : x) : { ...x, correct: k === i })))}
                />
                <span>{ch.correct ? "Correct" : ""}</span>
              </label>
              <b className="qb-letter">{LETTERS[i]}</b>
              <input className="input" value={ch.text} readOnly={kind === "truefalse"} placeholder={`Choice ${LETTERS[i]}`} aria-label={`Choice ${LETTERS[i]}`}
                onChange={(e) => setChoices(choices.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
              {kind !== "truefalse" && <button type="button" className="btn qb-btn" aria-label={`Remove choice ${LETTERS[i]}`} onClick={() => setChoices(choices.filter((_, k) => k !== i))} disabled={choices.length <= 2}>✕</button>}
            </div>
          ))}
          {kind !== "truefalse" && choices.length < MAX && <button type="button" className="btn qb-btn qe-add" onClick={() => setChoices([...choices, { text: "", correct: false }])}>+ Add choice</button>}
        </div>
      )}

      {/* ---- Matching ---- */}
      {kind === "match" && (
        <div className="qe-block">
          <div className="qe-match-head small"><span>Item (what the candidate sees)</span><span>Correct match</span><span /></div>
          {pairs.map((p, i) => (
            <div key={i} className="qe-match-row">
              <input className="input" value={p.item} placeholder="e.g. CO-18" aria-label={`Item ${i + 1}`} onChange={(e) => setPairs(pairs.map((x, k) => (k === i ? { ...x, item: e.target.value } : x)))} />
              <span className="qe-arrow" aria-hidden>→</span>
              <input className="input" value={p.answer} placeholder="e.g. Duplicate claim" aria-label={`Correct match for item ${i + 1}`} list={`answers-${row.row}`} onChange={(e) => setPairs(pairs.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))} />
              <button type="button" className="btn qb-btn" aria-label={`Remove pair ${i + 1}`} onClick={() => setPairs(pairs.filter((_, k) => k !== i))} disabled={pairs.length <= 2}>✕</button>
            </div>
          ))}
          <datalist id={`answers-${row.row}`}>{[...new Set(pairs.map((p) => p.answer.trim()).filter(Boolean))].map((a) => <option key={a} value={a} />)}</datalist>
          <button type="button" className="btn qb-btn qe-add" onClick={() => setPairs([...pairs, { item: "", answer: "" }])}>+ Add pair</button>
          <div className="small qe-block-title" style={{ marginTop: 12 }}>Extra wrong answers (optional)</div>
          <div className="small muted" style={{ marginBottom: 6 }}>Added to every dropdown so the last item isn’t a giveaway. Up to {MAX} answers in total; the app sorts them A–Z for candidates.</div>
          <ListInputs items={extras} onChange={setExtras} addLabel="+ Add wrong answer" placeholder="e.g. Coordination of benefits" ariaLabel="Wrong answer" />
          <label className="small qe-inline" style={{ marginTop: 10 }}><input type="checkbox" checked={perRow} onChange={(e) => setPerRow(e.target.checked)} /> 1 point per item (each item numbered as its own question). Untick for 1 point, all items must be right.</label>
        </div>
      )}

      {/* ---- Put in order ---- */}
      {kind === "order" && (
        <div className="qe-block">
          <div className="small qe-block-title">Steps, in the CORRECT order (first at the top)</div>
          <div className="small muted" style={{ marginBottom: 6 }}>Type them in the right order. The app mixes them up for candidates.</div>
          <ListInputs items={steps} onChange={setSteps} addLabel="+ Add step" placeholder="Step" numbered reorder ariaLabel="Step" />
          <label className="small qe-inline" style={{ marginTop: 10 }}><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Partial credit: 1 point for each step in the right place. Untick for all-or-nothing.</label>
        </div>
      )}

      {/* ---- Grid ---- */}
      {kind === "grid" && (
        <div className="qe-block">
          <div className="small qe-block-title">Column headings</div>
          <ListInputs items={gridCols} onChange={(cols) => { setGridCols(cols); setGridRowsS(gridRowsS.map((r) => ({ ...r, col: r.col < cols.length ? r.col : -1 }))); }} addLabel="+ Add column" placeholder="e.g. Priority 1" ariaLabel="Column" />
          <div className="small qe-block-title" style={{ marginTop: 12 }}>Rows: type each row, then click its correct column</div>
          <div className="table-scroll">
            <table className="qe-gridtable">
              <thead><tr><th>Row</th>{gridCols.map((col, j) => <th key={j}>{col || `Column ${j + 1}`}</th>)}<th /></tr></thead>
              <tbody>
                {gridRowsS.map((r, i) => (
                  <tr key={i}>
                    <td><input className="input" value={r.text} placeholder={`Row ${i + 1}`} aria-label={`Row ${i + 1}`} onChange={(e) => setGridRowsS(gridRowsS.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} /></td>
                    {gridCols.map((col, j) => (
                      <td key={j} className="qe-gridcell">
                        <input type="radio" name={`g-${row.row}-${i}`} checked={r.col === j} aria-label={`Row ${i + 1}: ${col || `Column ${j + 1}`} is correct`} onChange={() => setGridRowsS(gridRowsS.map((x, k) => (k === i ? { ...x, col: j } : x)))} />
                      </td>
                    ))}
                    <td><button type="button" className="btn qb-btn" aria-label={`Remove row ${i + 1}`} onClick={() => setGridRowsS(gridRowsS.filter((_, k) => k !== i))} disabled={gridRowsS.length <= 1}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn qb-btn qe-add" onClick={() => setGridRowsS([...gridRowsS, { text: "", col: -1 }])}>+ Add row</button>
          <label className="small qe-inline" style={{ marginTop: 10 }}><input type="checkbox" checked={perRow} onChange={(e) => setPerRow(e.target.checked)} /> 1 point per row (each row numbered as its own question). Untick for 1 point, all rows must be right.</label>
        </div>
      )}

      {/* ---- Fill in the blanks ---- */}
      {kind === "blanks" && (
        <div className="qe-block">
          <button type="button" className="btn qb-btn" onClick={insertBlank}>+ Insert blank at the cursor</button>
          <span className="small muted" style={{ marginLeft: 8 }}>{blankN ? `${blankN} blank${blankN === 1 ? "" : "s"} in the question` : "Click in the question where the blank goes, then click Insert blank (or type ___)."}</span>
          {blankN > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {Array.from({ length: blankN }, (_, i) => {
                const before = blankParts[i].slice(-30).trimStart();
                const after = blankParts[i + 1].slice(0, 30).trimEnd();
                const alts = blankAns[i] ?? [""];
                const setAlts = (a: string[]) => setBlankAns(Array.from({ length: Math.max(blankN, blankAns.length) }, (_, k) => (k === i ? a : blankAns[k] ?? [""])));
                return (
                  <div key={i} className="qe-blank">
                    <div className="small"><b>Blank {i + 1}</b> <span className="muted">…{before} <u>&nbsp;?&nbsp;</u> {after}…</span></div>
                    {alts.map((a, j) => (
                      <div key={j} className="qe-list-row">
                        <input className="input" value={a} placeholder={j ? "Also accept…" : "Correct answer"} aria-label={`Blank ${i + 1} answer ${j + 1}`} onChange={(e) => setAlts(alts.map((x, k) => (k === j ? e.target.value : x)))} />
                        {j > 0 && <button type="button" className="btn qb-btn" aria-label="Remove" onClick={() => setAlts(alts.filter((_, k) => k !== j))}>✕</button>}
                      </div>
                    ))}
                    <button type="button" className="btn qb-btn qe-add" onClick={() => setAlts([...alts, ""])}>+ Also accept another spelling</button>
                  </div>
                );
              })}
            </div>
          )}
          <label className="small qe-inline" style={{ marginTop: 10 }}><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Partial credit: 1 point for each blank answered right. Untick for all-or-nothing.</label>
        </div>
      )}

      {/* ---- Typed / number / date ---- */}
      {kind === "text" && (
        <div className="qe-block">
          <div className="small qe-block-title">Correct answer</div>
          <ListInputs items={accepted.length ? accepted : [""]} onChange={setAccepted} addLabel="+ Also accept another answer" placeholder="Correct answer" max={10} ariaLabel="Accepted answer" />
        </div>
      )}
      {kind === "number" && (
        <div className="qe-block filters" style={{ marginTop: 0 }}>
          <label className="small field">Correct number<input className="input" inputMode="decimal" placeholder="e.g. 125.40" value={numAns} onChange={(e) => setNumAns(e.target.value)} /></label>
          <label className="small field">Allowed difference (optional)<input className="input" inputMode="decimal" placeholder="e.g. 0.01" value={numTol} onChange={(e) => setNumTol(e.target.value)} /></label>
        </div>
      )}
      {kind === "date" && (
        <label className="small">Correct date<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      )}

      {showPoints && (
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

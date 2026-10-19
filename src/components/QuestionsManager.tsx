"use client";
import { numberLabel, pointsOf } from "@/content/answers";
import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { ParseResult, ParsedAssessment } from "@/lib/questionbank";

type Live = { slug: string; title: string; version: number | null; questions: number; publishedAt: number | null; publishedBy: string | null };
type MediaItem = { name: string; source: "built-in" | "uploaded"; size: number | null; uploadedAt: number | null; kind: "image" | "video" | "audio" | null; inUse: boolean };
type MediaList = { blobConfigured: boolean; assessments: { slug: string; title: string; items: MediaItem[] }[] };
type Check = ({ tab: false } | ({ tab: true } & ParseResult)) & { sheetUrl?: string | null };

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const fmtSize = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

export default function QuestionsManager({ canEdit, live: initialLive }: { canEdit: boolean; live: Live[] }) {
  const [live, setLive] = useState(initialLive);
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ParsedAssessment | null>(null);
  const [busy, setBusy] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setErr("");
    try {
      setCheck(await api<Check>("/api/admin/questions/check"));
    } catch (e) {
      setErr((e as Error).message);
    }
    setChecking(false);
  }, []);

  async function seed() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ created: string[]; skipped: string[] }>("/api/admin/questions/seed", { method: "POST" });
      setMsg(
        r.created.length
          ? `Filled in the ${r.created.join(", ")} tab${r.created.length === 1 ? "" : "s"} with the live questions. Open the Sheet to edit them.`
          : `Nothing to fill in: ${r.skipped.join(", ")} already ${r.skipped.length === 1 ? "has" : "have"} content.`,
      );
      await runCheck();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  async function publish(a: ParsedAssessment) {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ version: number }>("/api/admin/questions/publish", { method: "POST", body: JSON.stringify({ slug: a.slug }) });
      setMsg(`Published ${a.title} — question set v${r.version} is live.`);
      setLive((l) => l.map((x) => (x.slug === a.slug ? { ...x, version: r.version, questions: a.questionCount, publishedAt: Date.now(), publishedBy: "you" } : x)));
      setConfirm(null);
      await runCheck();
    } catch (e) {
      setErr((e as Error).message);
      setConfirm(null);
    }
    setBusy(false);
  }

  const checkData = check && check.tab ? check : null;

  return (
    <>
      {msg && <div className="notice notice-info" style={{ marginBottom: 12 }} role="status">{msg}</div>}
      {err && <div className="notice notice-bad" style={{ marginBottom: 12 }} role="alert">{err}</div>}

      <div className="panel">
        <div className="dash-head">
          <div>
            <h2>Live questions</h2>
            <p className="sub">What candidates get when they start an assessment now</p>
          </div>
          {check?.sheetUrl && <a className="btn" href={check.sheetUrl} target="_blank" rel="noreferrer">Open the Sheet ↗</a>}
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Assessment</th><th>Question set</th><th className="num">Questions</th><th>Published</th></tr></thead>
            <tbody>
              {live.map((l) => (
                <tr key={l.slug}>
                  <td><b>{l.title}</b></td>
                  <td>{l.version == null ? <span className="pill pill-neutral">Coming soon</span> : <span className="pill pill-good">v{l.version}{l.version === 0 ? " (original)" : ""}</span>}</td>
                  <td className="num">{l.questions || "—"}</td>
                  <td className="small muted">{l.publishedAt ? `${fmtDate(l.publishedAt)} · ${l.publishedBy}` : l.version === 0 ? "Built in" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel section-gap">
        <div className="dash-head">
          <div>
            <h2>Check the questions Sheet</h2>
            <p className="sub">Reads the Sheet, checks every row and shows what would change. Nothing goes live until you publish.</p>
          </div>
          <button className="btn btn-primary" onClick={runCheck} disabled={checking}>{checking ? "Checking…" : check ? "Check again" : "Check the questions Sheet"}</button>
        </div>

        {check && !check.tab && (
          <div className="notice notice-info" style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 10px" }}>
              The questions Sheet doesn’t have any questions yet. Fill in each assessment’s tab with the questions that are live now
              (tabs are named after the assessment, e.g. <b>Medical Biller</b>), then edit them in the Sheet.
            </p>
            <button className="btn btn-primary" onClick={seed} disabled={!canEdit || busy}>{busy ? "Filling in…" : "Fill in the live questions"}</button>
          </div>
        )}

        {checkData && checkData.errors.length > 0 && (
          <div className="notice notice-bad small" style={{ marginTop: 12 }}>
            <b>Couldn’t read:</b>
            <ul className="clean" style={{ margin: "6px 0 0" }}>{checkData.errors.map((e, i) => <li key={i}>{where(e)}{e.message}</li>)}</ul>
          </div>
        )}

        {checkData && checkData.assessments.length === 0 && checkData.errors.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>The questions Sheet has no question rows yet.</p>
        )}

        {checkData && checkData.assessments.map((a) => {
          const blocked = a.errors.length > 0 || checkData.errors.length > 0;
          return (
            <div key={a.slug} className="qb-row">
              <div className="qb-head">
                <div>
                  <b>{a.title}</b>
                  <div className="small muted">{a.sectionCount} section{a.sectionCount === 1 ? "" : "s"} · {a.questionCount} question{a.questionCount === 1 ? "" : "s"}</div>
                </div>
                <div className="btn-row" style={{ alignItems: "center" }}>
                  {a.errors.length > 0 ? (
                    <span className="pill pill-bad">✗ {a.errors.length} problem{a.errors.length === 1 ? "" : "s"}</span>
                  ) : !a.changed ? (
                    <span className="pill pill-neutral">Same as live</span>
                  ) : (
                    <span className="pill pill-good">✓ Ready · would be v{(a.currentVersion ?? 0) + 1}</span>
                  )}
                  <button className="btn qb-btn" onClick={() => setPreview(preview === a.slug ? null : a.slug)}>{preview === a.slug ? "Hide preview" : "Preview"}</button>
                  {canEdit && a.changed && (
                    <button className="btn btn-primary qb-btn" disabled={blocked || busy} onClick={() => setConfirm(a)}>Publish</button>
                  )}
                </div>
              </div>
              {a.errors.length > 0 && (
                <ul className="clean small qb-issues bad">{a.errors.map((e, i) => <li key={i}>{where(e)}{e.message}</li>)}</ul>
              )}
              {a.warnings.length > 0 && (
                <ul className="clean small qb-issues warn">{a.warnings.map((e, i) => <li key={i}>{where(e)}{e.message}</li>)}</ul>
              )}
              {preview === a.slug && <Preview a={a} />}
            </div>
          );
        })}
      </div>

      <MediaPanel canEdit={canEdit} />

      {confirm && (
        <div className="modal-back" role="dialog" aria-modal>
          <div className="modal">
            <h2>Publish {confirm.title}?</h2>
            <p className="muted">
              {confirm.questionCount} questions become question set <b>v{(confirm.currentVersion ?? 0) + 1}</b>. Candidates who start after this get
              the new questions. Attempts already in progress and past results keep their version.
            </p>
            <div className="btn-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={() => publish(confirm)} disabled={busy}>{busy ? "Publishing…" : "Publish"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function where(e: { row: number; where?: string }) {
  return e.where ? `${e.where}: ` : e.row ? `Row ${e.row}: ` : "";
}

function Preview({ a }: { a: ParsedAssessment }) {
  let n = 0;
  return (
    <div className="qb-preview">
      {a.content.sections.map((s) => (
        <div key={s.id} style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 4 }}>{s.title}</h3>
          {s.description && <p className="small muted" style={{ whiteSpace: "pre-line" }}>{s.description}</p>}
          {(s.stimuli ?? []).length > 0 && (
            <div className="qb-media">
              {(s.stimuli ?? []).map((st) => (
                <figure key={st.file} className={st.type === "audio" ? "qb-audio" : undefined}>
                  {st.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/asset/${a.slug}/${encodeURIComponent(st.file)}`} alt={st.caption} />
                  ) : st.type === "audio" ? (
                    <audio src={`/api/asset/${a.slug}/${encodeURIComponent(st.file)}`} controls preload="none" />
                  ) : (
                    <div className="qb-video">▶ Video</div>
                  )}
                  <figcaption className="small">{st.caption}<br /><span className="muted">{st.file}</span></figcaption>
                </figure>
              ))}
            </div>
          )}
          {s.questions.map((q) => {
            const start = n + 1;
            n += pointsOf(q);
            return (
              <div key={q.id} className="qb-q">
                <div><b>{numberLabel(start, pointsOf(q))}.</b> {q.prompt}</div>
                {q.options.length === 0 ? (
                  <div className="small" style={{ marginTop: 6 }}>
                    Typed answer. Accepted: <span className="pill pill-good">✓ {q.answer.split("\n").filter(Boolean).join(" or ")}</span>
                  </div>
                ) : q.rows?.length ? (
                  <>
                    <div className="small muted" style={{ marginTop: 6 }}>
                      {q.scoring === "per-row" ? `One answer per row · counts as ${q.rows.length} questions (${numberLabel(start, q.rows.length)}), 1 point each` : "One answer per row · 1 point, all rows must be right"}
                    </div>
                    <div className="table-scroll">
                      <table className="qb-grid">
                        <thead>
                          <tr>
                            <th></th>
                            {q.options.map((o) => <th key={o.id} scope="col">{o.text}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {q.rows.map((r, ri) => {
                            const col = q.answer.split(",")[ri];
                            return (
                              <tr key={r.id}>
                                <th scope="row">{q.scoring === "per-row" && <span className="muted" style={{ marginRight: 6 }}>{start + ri}.</span>}{r.text}</th>
                                {q.options.map((o) => (
                                  <td key={o.id} aria-label={o.id === col ? `${r.text}: ${o.text} (correct)` : undefined}>
                                    <span className={`qb-dot ${o.id === col ? "on" : ""}`} />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <ul>
                    {q.options.map((o) => (
                      <li key={o.id} className={o.id === q.answer ? "correct" : ""}>
                        <span className="qb-letter">{o.id.toUpperCase()}</span> {o.text} {o.id === q.answer && <span className="pill pill-good">✓ correct</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MediaPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<MediaList | null>(null);
  const [slug, setSlug] = useState("medical-biller");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<MediaList>("/api/admin/media"));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function doUpload() {
    if (!files.length) return;
    setErr("");
    setMsg("");
    const done: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(0);
        setUploading(files.length > 1 ? `${i + 1} of ${files.length}` : "");
        const safe = file.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
        const blob = await upload(`assessments/${slug}/${safe}`, file, {
          access: "private",
          handleUploadUrl: "/api/admin/media/upload",
          clientPayload: slug,
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });
        const r = await api<{ name: string; replaced: boolean }>("/api/admin/media", {
          method: "POST",
          body: JSON.stringify({ slug, name: file.name, pathname: blob.pathname, size: file.size }),
        });
        done.push(r.name);
      }
      setMsg(`Uploaded ${done.length} file${done.length === 1 ? "" : "s"}: ${done.join(", ")}. Use these exact names in the Section Media column.`);
      setFiles([]);
      const input = document.getElementById("media-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) {
      setErr(`${(e as Error).message}${done.length ? ` (uploaded before the error: ${done.join(", ")})` : ""}`);
    }
    await load();
    setProgress(null);
    setUploading("");
  }

  async function remove(s: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return;
    setErr("");
    try {
      await api("/api/admin/media", { method: "DELETE", body: JSON.stringify({ slug: s, name }) });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const group = data?.assessments.find((a) => a.slug === slug);

  return (
    <div className="panel section-gap">
      <h2>Images, videos &amp; audio</h2>
      <p className="sub">
        Upload a file here, then put its name in the <b>Section Media</b> column, e.g. <code>eob-2026.png | EOB for this section</code>.
        Uploading a file with the same name replaces it everywhere it’s used.
      </p>
      {data && !data.blobConfigured && (
        <div className="notice notice-warn small" style={{ marginBottom: 12 }}>
          File storage isn’t connected yet, so uploads won’t work. In Vercel, open <b>Storage → Create → Blob</b> and connect it to this project.
          The files that came with the app still work.
        </div>
      )}
      {msg && <div className="notice notice-info small" style={{ marginBottom: 10 }}>{msg}</div>}
      {err && <div className="notice notice-bad small" style={{ marginBottom: 10 }}>{err}</div>}

      <div className="filters" style={{ marginTop: 0 }}>
        <div className="field">
          <label htmlFor="media-slug">Assessment</label>
          <select id="media-slug" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {data?.assessments.map((a) => <option key={a.slug} value={a.slug}>{a.title}</option>)}
          </select>
        </div>
        {canEdit && (
          <>
            <div className="field" style={{ flex: "2 1 260px" }}>
              <label htmlFor="media-file">Images, videos or audio (you can pick several)</label>
              <input id="media-file" type="file" multiple className="input" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </div>
            <button className="btn btn-primary" disabled={!files.length || progress !== null || !data?.blobConfigured} onClick={doUpload}>
              {progress !== null ? `Uploading ${uploading} … ${progress}%` : files.length > 1 ? `Upload ${files.length} files` : "Upload"}
            </button>
          </>
        )}
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>File name (use in the Sheet)</th><th>Type</th><th>Source</th><th className="num">Size</th><th>Used by live questions</th><th></th></tr></thead>
          <tbody>
            {!group?.items.length && <tr><td colSpan={6} className="muted">No files for this assessment yet.</td></tr>}
            {group?.items.map((m) => (
              <tr key={m.name}>
                <td><code>{m.name}</code></td>
                <td className="small">{m.kind === "video" ? "Video" : m.kind === "audio" ? "Audio" : "Image"}</td>
                <td className="small muted">{m.source === "built-in" ? "Came with the app" : `Uploaded ${fmtDate(m.uploadedAt)}`}</td>
                <td className="num small">{fmtSize(m.size)}</td>
                <td className="small">{m.inUse ? "Yes" : "—"}</td>
                <td>
                  {canEdit && m.source === "uploaded" && !m.inUse && (
                    <button className="btn qb-btn" onClick={() => remove(slug, m.name)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

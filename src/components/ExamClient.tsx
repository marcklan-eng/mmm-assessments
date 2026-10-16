"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicAttempt } from "@/lib/attempts";
import type { ActivityType } from "@/lib/types";
import "./exam.css";
import { isAnswered, setGridRow } from "@/content/answers";

type Stim = PublicAttempt["sections"][number]["stimuli"][number];

export default function ExamClient({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [sectionIdx, setSectionIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guard, setGuard] = useState<null | "fullscreen" | "away">(null);
  const [viewer, setViewer] = useState<Stim | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const submittedRef = useRef(false);
  const [everFullscreen, setEverFullscreen] = useState(false);
  const fsSupported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      const t0 = Date.now();
      const res = await fetch(`/api/attempts/current?slug=${slug}`, { cache: "no-store" });
      if (res.status === 401) return void (window.location.href = `/a/${slug}`);
      const j = await res.json();
      if (j.state !== "in-progress") return void (window.location.href = `/a/${slug}`);
      const a: PublicAttempt = j.attempt;
      setOffset(a.serverNow - Math.round((t0 + Date.now()) / 2));
      setAnswers(a.answers);
      setData(a);
    })();
  }, [slug]);

  // ---------- activity logging ----------
  const lastLog = useRef<Record<string, number>>({});
  const log = useCallback(
    (type: ActivityType) => {
      if (!data || submittedRef.current) return;
      const t = Date.now();
      if (t - (lastLog.current[type] ?? 0) < 1500) return; // de-duplicate bursts
      lastLog.current[type] = t;
      fetch("/api/attempts/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: data.attemptId, type }),
        keepalive: true,
      }).catch(() => {});
    },
    [data],
  );

  // ---------- submit ----------
  const submit = useCallback(
    async (auto: boolean) => {
      if (!data || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      for (let i = 0; i < 4; i++) {
        try {
          const r = await fetch("/api/attempts/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attemptId: data.attemptId, auto }),
          });
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
      window.location.href = `/a/${slug}/done`;
    },
    [data, slug],
  );

  // ---------- timer ----------
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = data ? Math.max(0, data.deadline - (now + offset)) : 0;
  useEffect(() => {
    if (data && remaining <= 0) submit(true);
  }, [data, remaining, submit]);

  // ---------- fullscreen / focus guard ----------
  useEffect(() => {
    if (!data) return;
    const evaluate = () => {
      if (submittedRef.current) return setGuard(null);
      if (fsSupported && !document.fullscreenElement) return setGuard("fullscreen");
      if (document.hidden || !document.hasFocus()) return setGuard("away");
      setGuard(null);
    };
    const onVis = () => { if (document.hidden) log("tab_switch"); evaluate(); };
    const onBlur = () => { log("tab_switch"); evaluate(); };
    const onFs = () => {
      if (document.fullscreenElement) setEverFullscreen(true);
      else log("fullscreen_exit");
      evaluate();
    };
    evaluate();
    const poll = setInterval(evaluate, 1000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", evaluate);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", evaluate);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [data, fsSupported, log]);

  // ---------- copy / screenshot deterrents ----------
  useEffect(() => {
    if (!data) return;
    const block = (type: ActivityType) => (e: Event) => { e.preventDefault(); log(type); };
    const onCopy = block("copy_attempt");
    const onCtx = block("right_click");
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === "PrintScreen") {
        log("screenshot_key");
        navigator.clipboard?.writeText("").catch(() => {});
        setGuard("away");
        setTimeout(() => setGuard(null), 1200);
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) log("screenshot_key");
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "v", "a", "p", "s", "u"].includes(k)) {
        e.preventDefault();
        log("copy_attempt");
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey, true);
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => {}); };
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [data, log]);

  // ---------- answering ----------
  async function choose(qid: string, oid: string) {
    if (!data || submittedRef.current) return;
    setAnswers((a) => ({ ...a, [qid]: oid }));
    setPending((p) => ({ ...p, [qid]: true }));
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch("/api/attempts/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: data.attemptId, questionId: qid, optionId: oid }),
        });
        if (r.ok) { setSaveError(false); break; }
        if (r.status === 409) return submit(true);
      } catch {}
      if (i === 2) setSaveError(true);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPending((p) => ({ ...p, [qid]: false }));
  }

  const watermark = useMemo(() => {
    if (!data) return "";
    const text = `${data.email} · ${data.name}`.replace(/[<&>"]/g, "");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' transform='rotate(-22 210 110)' font-family='Arial' font-size='15' fill='rgba(120,120,120,0.13)'>${text}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [data]);

  if (!data) return <div className="exam-loading">Loading your assessment…</div>;

  const total = data.sections.reduce((n, s) => n + s.questions.length, 0);
  const allQs = data.sections.flatMap((s) => s.questions);
  const answered = allQs.filter((q) => isAnswered(q, answers[q.id])).length;
  const section = data.sections[sectionIdx];
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const timerClass = remaining < 60_000 ? "timer danger" : remaining < 5 * 60_000 ? "timer warn" : "timer";
  const blurred = guard !== null;

  function goTo(i: number) {
    setSectionIdx(i);
    document.querySelector(".exam-body")?.scrollTo({ top: 0 });
  }

  return (
    <div className="exam no-select">
      <header className="exam-head">
        <div className="exam-title">
          <b>{data.title}</b>
          <span className="small muted">{answered} of {total} answered</span>
        </div>
        <div className={timerClass} role="timer" aria-live="off">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
        <button className="btn btn-primary" onClick={() => setConfirming(true)} disabled={submitting}>Submit</button>
      </header>

      <nav className="exam-nav" aria-label="Sections">
        {data.sections.map((s, i) => {
          const done = s.questions.filter((q) => isAnswered(q, answers[q.id])).length;
          return (
            <button key={s.id} className={`sec-tab ${i === sectionIdx ? "active" : ""}`} onClick={() => goTo(i)}>
              <span>{s.title}</span>
              <span className={`sec-count ${done === s.questions.length ? "full" : ""}`}>{done}/{s.questions.length}</span>
            </button>
          );
        })}
      </nav>

      <main className="exam-body" style={{ filter: blurred ? "blur(18px)" : undefined }} aria-hidden={blurred}>
        <div className="exam-inner">
          <p className="eyebrow">Section {sectionIdx + 1} of {data.sections.length}</p>
          <h1>{section.title}</h1>
          {section.description && <p className="muted">{section.description}</p>}

          {section.stimuli.length > 0 && (
            <div className="stimuli">
              {section.stimuli.map((st) =>
                st.type === "video" ? (
                  <figure key={st.file} className="stim stim-video">
                    <video src={st.url} controls controlsList="nodownload noplaybackrate" disablePictureInPicture preload="metadata" />
                    <figcaption>{st.caption}</figcaption>
                  </figure>
                ) : (
                  <figure key={st.file} className="stim stim-full">
                    <div className="stim-head">
                      <figcaption>{st.caption}</figcaption>
                      <button className="btn zoom-btn" onClick={() => setViewer(st)}>Zoom</button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={st.url} alt={st.caption} draggable={false} />
                  </figure>
                ),
              )}
            </div>
          )}

          {section.questions.map((q) => (
            <fieldset key={q.id} className="question">
              <legend>
                <span className="qnum">{q.number}</span>
                <span>{q.prompt}</span>
              </legend>
              {q.rows ? (
                <div className="grid-q" role="group">
                  <p className="small muted" style={{ margin: "0 0 8px" }}>Choose one answer for each row.</p>
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        {q.options.map((o) => <th key={o.id} scope="col">{o.text}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {q.rows.map((r, ri) => {
                        const picked = (answers[q.id] ?? "").split(",")[ri];
                        return (
                          <tr key={r.id}>
                            <th scope="row">{r.text}</th>
                            {q.options.map((o) => (
                              <td key={o.id}>
                                <label className={`grid-cell ${picked === o.id ? "chosen" : ""}`}>
                                  <input
                                    type="radio"
                                    name={`${q.id}-${r.id}`}
                                    aria-label={`${r.text}: ${o.text}`}
                                    checked={picked === o.id}
                                    onChange={() => choose(q.id, setGridRow(answers[q.id], q.rows!.length, ri, o.id))}
                                  />
                                </label>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="options">
                  {q.options.map((o) => (
                    <label key={o.id} className={`option ${answers[q.id] === o.id ? "chosen" : ""}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === o.id} onChange={() => choose(q.id, o.id)} />
                      <span>{o.text}</span>
                    </label>
                  ))}
                </div>
              )}
              {pending[q.id] && <span className="small muted">Saving…</span>}
            </fieldset>
          ))}

          <div className="exam-pager">
            <button className="btn" disabled={sectionIdx === 0} onClick={() => goTo(sectionIdx - 1)}>← Previous section</button>
            {sectionIdx < data.sections.length - 1 ? (
              <button className="btn btn-primary" onClick={() => goTo(sectionIdx + 1)}>Next section →</button>
            ) : (
              <button className="btn btn-primary" onClick={() => setConfirming(true)}>Review & submit</button>
            )}
          </div>
        </div>
      </main>

      <div className="watermark" style={{ backgroundImage: watermark }} aria-hidden />

      {saveError && <div className="save-error">Your last answer didn’t save. Check your connection; it will retry when you answer again.</div>}

      {viewer && !blurred && (
        <div className="viewer" role="dialog" aria-modal aria-label={viewer.caption}>
          <ImageViewer stim={viewer} onClose={() => setViewer(null)} />
        </div>
      )}

      {confirming && !blurred && (
        <div className="modal-back" role="dialog" aria-modal>
          <div className="modal">
            <h2>Submit your assessment?</h2>
            {answered < total ? (
              <p className="notice notice-warn">You have <b>{total - answered}</b> unanswered question{total - answered === 1 ? "" : "s"}.</p>
            ) : (
              <p className="muted">All {total} questions are answered.</p>
            )}
            <p className="muted">You can’t change your answers after submitting.</p>
            <div className="btn-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConfirming(false)}>Keep working</button>
              <button className="btn btn-primary" onClick={() => submit(false)} disabled={submitting}>{submitting ? "Submitting…" : "Submit"}</button>
            </div>
          </div>
        </div>
      )}

      {guard && !submitting && (
        <div className="guard">
          <div className="modal">
            {guard === "fullscreen" ? (
              <>
                <h2>{everFullscreen ? "Return to fullscreen" : "Enter fullscreen to begin"}</h2>
                <p className="muted">
                  {everFullscreen
                    ? "The assessment only runs in fullscreen. Leaving fullscreen is recorded. The timer is still running."
                    : "The assessment runs in fullscreen. Leaving fullscreen or switching to another window hides the questions and is recorded. Your timer has started."}
                </p>
                <button className="btn btn-primary btn-block" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
                  {everFullscreen ? "Return to fullscreen" : "Enter fullscreen"}
                </button>
              </>
            ) : (
              <>
                <h2>Questions hidden</h2>
                <p className="muted">You left the assessment window. This is recorded. Click here to continue. The timer is still running.</p>
                <button className="btn btn-primary btn-block" onClick={() => { window.focus(); setGuard(null); }}>Continue</button>
              </>
            )}
            <p className="small muted" style={{ marginTop: 12, textAlign: "center" }}>Time left: {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageViewer({ stim, onClose }: { stim: Stim; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="viewer-bar">
        <span>{stim.caption}</span>
        <div className="btn-row">
          <button className="btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
          <button className="btn" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">+</button>
          <button className="btn" onClick={() => setZoom(1)}>Fit</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="viewer-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stim.url} alt={stim.caption} draggable={false} style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none" }} />
      </div>
    </>
  );
}

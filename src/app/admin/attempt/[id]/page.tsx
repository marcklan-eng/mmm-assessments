import Link from "next/link";
import { notFound } from "next/navigation";
import "../../admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import { db } from "@/lib/db";
import { finalizeIfExpired } from "@/lib/attempts";
import { getMeta } from "@/content/assessments";
import { getContent } from "@/content";
import { fmtDuration } from "@/lib/google";
import { ACTIVITY_LABELS } from "@/lib/types";
import DeleteAttempt from "@/components/DeleteAttempt";
import { isEditor } from "@/lib/evaluators";
import { answerText, isCorrect, isPerRow, itemsOf, numberLabel, pointsEarned, pointsOf } from "@/content/answers";

export const dynamic = "force-dynamic";
const dt = (ms?: number) => (ms ? new Date(ms).toLocaleString("en-US") : "—");

export default async function AttemptDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminGate path={`/admin/attempt/${id}`}>
      {async (user) => {
        const raw = await db.getAttempt(id);
        if (!raw) notFound();
        const a = raw.deletedAt ? raw : await finalizeIfExpired(raw);
        const canDelete = await isEditor(user.email);
        const content = await getContent(a.slug, a.version ?? 0);
        const meta = getMeta(a.slug);
        let n = 0;
        return (
          <>
            <TopBar email={user.email} />
            <main className="wrap-wide" style={{ maxWidth: 980 }}>
              <Link href={`/admin?assessment=${a.slug}`} className="small">← Back to dashboard</Link>
              <div className="dash-head" style={{ marginTop: 10 }}>
                <div>
                  <h1 style={{ marginBottom: 4 }}>{a.name}</h1>
                  <p className="muted" style={{ marginTop: 0 }}>{a.email} · signed in with {a.provider} · {meta?.title} · question set v{a.version ?? 0}</p>
                </div>
                {canDelete && <DeleteAttempt id={a.id} name={a.name} title={meta?.title ?? "this"} deleted={Boolean(a.deletedAt)} />}
              </div>
              {a.deletedAt && (
                <div className="notice notice-warn" style={{ marginBottom: 14 }}>
                  <b>Deleted</b> by {a.deletedBy} on {dt(a.deletedAt)}{a.deleteReason ? <> · Reason: “{a.deleteReason}”</> : null}. It’s hidden from the
                  dashboard and the candidate can take the assessment again. Restore it to undo.
                </div>
              )}

              <section className="kpis">
                <div className="kpi"><div className="k-label">Score</div><div className="k-value">{a.score != null ? `${a.score}/${a.total}` : "—"}</div><div className="k-sub">{a.percent != null ? `${a.percent}%` : "In progress"}</div></div>
                <div className="kpi"><div className="k-label">Result</div><div className="k-value" style={{ color: a.passed ? "var(--good)" : a.passed === false ? "var(--bad)" : undefined }}>{a.passed == null ? "—" : a.passed ? "✓ Pass" : "✗ Fail"}</div><div className="k-sub">Passing is {meta?.passPercent}%</div></div>
                <div className="kpi"><div className="k-label">Completion</div><div className="k-value" style={{ fontSize: "1.2rem" }}>{a.status === "timed_out" ? "⏱ Timed out" : a.status === "submitted" ? "Submitted" : "In progress"}</div><div className="k-sub">{a.submittedAt ? `Time used ${fmtDuration(Math.min(a.submittedAt, a.deadline) - a.startedAt)}` : ""}</div></div>
                <div className="kpi"><div className="k-label">Activity events</div><div className="k-value">{a.activity.length}</div><div className="k-sub">Window, fullscreen, copy</div></div>
              </section>

              <div className="grid-2">
                <div className="panel">
                  <h2>Details</h2>
                  <table className="data"><tbody>
                    <tr><td className="muted">Started</td><td>{dt(a.startedAt)}</td></tr>
                    <tr><td className="muted">Submitted</td><td>{dt(a.submittedAt)}</td></tr>
                    <tr><td className="muted">Retake after</td><td>{a.retakeAfter ? new Date(a.retakeAfter).toLocaleDateString("en-US") : "—"}</td></tr>
                    <tr><td className="muted">Google Sheet</td><td>{a.sheetSynced ? "Written" : a.sheetError ? <span style={{ color: "var(--bad)" }}>Failed: {a.sheetError}</span> : "Not connected"}</td></tr>
                    <tr><td className="muted">Attempt ID</td><td className="small">{a.id}</td></tr>
                  </tbody></table>
                </div>
                <div className="panel">
                  <h2>Activity log</h2>
                  {a.activity.length === 0 ? <p className="muted small">No events recorded.</p> : (
                    <div style={{ maxHeight: 240, overflowY: "auto" }}>
                      <table className="data"><tbody>
                        {a.activity.map((e, i) => (
                          <tr key={i}><td className="small num" style={{ width: 70 }}>+{fmtDuration(e.at - a.startedAt)}</td><td className="small">{ACTIVITY_LABELS[e.type]}</td></tr>
                        ))}
                      </tbody></table>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel section-gap">
                <h2>Answers</h2>
                <p className="sub">In original Form order</p>
                {content?.sections.map((s) => (
                  <div key={s.id} style={{ marginTop: 14 }}>
                    <h3>{s.title}</h3>
                    <table className="data"><tbody>
                      {s.questions.map((q) => {
                        const start = n + 1;
                        n += itemsOf(q);
                        const chosen = a.answers[q.id];
                        const ok = isCorrect(q, chosen);
                        return (
                          <tr key={q.id}>
                            <td className="num" style={{ width: 64, whiteSpace: "nowrap" }}>Q{numberLabel(start, itemsOf(q))}</td>
                            <td>
                              <div>{q.prompt}</div>
                              <div className="small" style={{ marginTop: 4 }}>
                                {!chosen ? <span className="pill pill-warn">Blank</span> : ok ? <span className="pill pill-good">✓ Correct{pointsOf(q) > 1 ? ` ${pointsOf(q)}/${pointsOf(q)}` : ""}</span> : pointsOf(q) > 1 && pointsEarned(q, chosen) > 0 ? <span className="pill pill-warn">{pointsEarned(q, chosen)}/{pointsOf(q)} {isPerRow(q) ? "rows" : "points"}</span> : <span className="pill pill-bad">✗ Incorrect</span>}{" "}
                                {chosen && !isPerRow(q) && <span>{q.options.length ? "Chose" : "Answered"}: {answerText(q, chosen)}</span>}
                                {isPerRow(q) && q.rows ? (
                                  <ul className="clean" style={{ margin: "6px 0 0" }}>
                                    {q.rows.map((r, ri) => {
                                      const got = (chosen ?? "").split(",")[ri], want = q.answer.split(",")[ri];
                                      const name = (id?: string) => q.options.find((o) => o.id === id)?.text ?? "—";
                                      return (
                                        <li key={r.id}>
                                          Q{start + ri} {r.text}: {got === want ? <span className="pill pill-good">✓ {name(got)}</span> : <><span className="pill pill-bad">✗ {got ? name(got) : "Blank"}</span> <span className="muted">Correct: {name(want)}</span></>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  !ok && <div className="muted">Correct: {answerText(q, q.answer)}</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody></table>
                  </div>
                ))}
              </div>
            </main>
          </>
        );
      }}
    </AdminGate>
  );
}

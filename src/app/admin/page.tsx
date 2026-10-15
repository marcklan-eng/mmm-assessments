import Link from "next/link";
import "./admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import { BarChart, LineChart, Legend, Meter } from "@/components/Charts";
import { allAttempts } from "@/lib/attempts";
import { applyFilters, overview, parseFilters, questionStats, sectionStats, weeklyTrend } from "@/lib/stats";
import { ASSESSMENTS, getMeta } from "@/content/assessments";
import { fmtDuration, sheetConfigured } from "@/lib/google";
import { DEMO_MODE } from "@/lib/auth";
import { dashboardOpenForDemo } from "@/lib/evaluators";
import { usingRedis } from "@/lib/db";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const dt = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <AdminGate path="/admin">
      {async (user) => {
        const f = parseFilters(sp);
        const list = applyFilters(await allAttempts(), f);
        const o = overview(list);
        const trend = weeklyTrend(list);
        const singleSlug = f.assessment !== "all" ? f.assessment : null;
        const qs = singleSlug ? questionStats(list, singleSlug) : [];
        const secs = singleSlug ? sectionStats(list, singleSlug) : [];
        // Medical Biller ↔ Advanced RCM side by side
        const all = await allAttempts();
        const rcmBy = new Map(all.filter((a) => a.slug === "advanced-rcm" && a.status !== "in_progress").map((a) => [a.email, a]));
        const exportQs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

        return (
          <>
            <TopBar email={user.email} right={<Link className="small" href="/">Assessments</Link>} />
            <main className="wrap-wide">
              {(DEMO_MODE || !usingRedis || !sheetConfigured) && (
                <div className="notice notice-warn small" style={{ marginBottom: 14 }}>
                  <b>Prototype setup:</b>{" "}
                  {[
                    DEMO_MODE && "demo sign-in is on",
                    dashboardOpenForDemo && "anyone signed in can see this dashboard",
                    !sheetConfigured && "Google Sheet not connected (results are not being written to a Sheet yet)",
                    !usingRedis && "using local file storage",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </div>
              )}
              <div className="dash-head">
                <div>
                  <p className="eyebrow">Executive dashboard</p>
                  <h1 style={{ marginBottom: 0 }}>{singleSlug ? `${getMeta(singleSlug)?.title} assessment` : "All assessments"}</h1>
                </div>
                <a className="btn" href={`/api/admin/export?${exportQs}`}>Export CSV</a>
              </div>

              <form className="filters" method="get">
                <div className="field">
                  <label htmlFor="assessment">Assessment</label>
                  <select id="assessment" name="assessment" className="input" defaultValue={f.assessment}>
                    <option value="all">All assessments</option>
                    {ASSESSMENTS.map((a) => <option key={a.slug} value={a.slug}>{a.title}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="from">From</label><input id="from" type="date" name="from" className="input" defaultValue={f.from} /></div>
                <div className="field"><label htmlFor="to">To</label><input id="to" type="date" name="to" className="input" defaultValue={f.to} /></div>
                <div className="field">
                  <label htmlFor="result">Result</label>
                  <select id="result" name="result" className="input" defaultValue={f.result}>
                    <option value="all">All</option><option value="pass">Passed</option><option value="fail">Failed</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="completion">Completion</label>
                  <select id="completion" name="completion" className="input" defaultValue={f.completion}>
                    <option value="all">All</option><option value="submitted">Submitted</option><option value="timed_out">Timed out</option><option value="in_progress">In progress</option>
                  </select>
                </div>
                <div className="field"><label htmlFor="q">Search</label><input id="q" name="q" className="input" placeholder="Name or email" defaultValue={f.q} /></div>
                <button className="btn btn-primary">Apply</button>
                <Link className="btn" href="/admin">Reset</Link>
              </form>

              <section className="kpis" aria-label="Overview">
                <Kpi label="Completed" value={o.completed} sub={`${o.started} started · ${o.inProgress} in progress`} />
                <Kpi label="Passed" value={o.passed} sub={`Pass rate ${pct(o.passRate)}`} />
                <Kpi label="Failed" value={o.failed} sub="Below 80%" />
                <Kpi label="Timed out" value={o.timedOut} sub={`${o.submitted} submitted on their own`} />
                <Kpi label="Average score" value={pct(o.avgScore)} sub="Passing is 80%" />
                <Kpi label="Average time" value={o.avgMinutes == null ? "—" : `${o.avgMinutes.toFixed(1)} min`} sub="Of 30 minutes" />
                <Kpi label="Flagged activity" value={o.flagged} sub="3+ window/copy events" />
              </section>

              <div className="grid-2">
                <div className="panel">
                  <h2>Completed per week</h2>
                  <p className="sub">Submitted and timed-out attempts</p>
                  <BarChart data={trend.map((t) => ({ label: t.label, value: t.count }))} unit="completed" />
                </div>
                <div className="panel">
                  <h2>Pass rate and average score per week</h2>
                  <Legend items={[{ name: "Pass rate", color: "var(--series-1)" }, { name: "Average score", color: "#eb6834" }, { name: "Passing score (80%)", color: "var(--text-3)", dashed: true }]} />
                  <LineChart
                    series={[
                      { name: "Pass rate", color: "var(--series-1)", data: trend.map((t) => ({ label: t.label, value: t.passRate })) },
                      { name: "Average score", color: "#eb6834", data: trend.map((t) => ({ label: t.label, value: t.avgScore })) },
                    ]}
                    refLine={{ value: 80, label: "80% pass" }}
                  />
                </div>
              </div>

              {singleSlug && secs.length > 0 && (
                <div className="panel section-gap">
                  <h2>Average score by section</h2>
                  <p className="sub">Share of answers correct in each section</p>
                  <table className="data">
                    <tbody>
                      {secs.map((s) => (
                        <tr key={s.title}>
                          <td style={{ width: "40%" }}>{s.title}</td>
                          <td style={{ width: "45%" }}><Meter value={s.pct ?? 0} /></td>
                          <td className="num">{pct(s.pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {singleSlug && qs.length > 0 && (
                <div className="panel section-gap">
                  <h2>Most-missed questions</h2>
                  <p className="sub">Question numbers follow the original Form order (candidates see questions shuffled). Blank answers count as missed.</p>
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr><th>#</th><th>Question</th><th>Missed</th><th></th><th>Most-picked wrong answer</th><th>Correct answer</th></tr>
                      </thead>
                      <tbody>
                        {qs.slice(0, 10).map((q) => (
                          <tr key={q.id}>
                            <td className="num">Q{q.number}</td>
                            <td className="q-prompt"><div className="clip" title={q.prompt}>{q.prompt}</div><div className="small muted">{q.section}</div></td>
                            <td className="num"><b>{pct(q.wrongPct)}</b></td>
                            <td style={{ minWidth: 90 }}><Meter value={q.wrongPct} tone="bad" /></td>
                            <td className="small">{q.topWrong ? <>{q.topWrong.text} <span className="muted">({pct(q.topWrong.pct)})</span></> : "—"}</td>
                            <td className="small muted">{q.correct}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {qs.length > 10 && <details className="small" style={{ marginTop: 8 }}><summary style={{ cursor: "pointer" }}>Show all {qs.length} questions</summary>
                    <table className="data" style={{ marginTop: 8 }}><tbody>
                      {qs.slice(10).map((q) => (
                        <tr key={q.id}><td className="num">Q{q.number}</td><td><div className="clip">{q.prompt}</div></td><td className="num">{pct(q.wrongPct)}</td><td className="small">{q.topWrong?.text ?? "—"}</td></tr>
                      ))}
                    </tbody></table>
                  </details>}
                </div>
              )}

              <div className="panel section-gap">
                <h2>Candidates</h2>
                <p className="sub">{list.length} attempt{list.length === 1 ? "" : "s"} · click a name for answers and activity</p>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Started</th><th>Candidate</th><th>Assessment</th><th className="num">Score</th><th>Result</th>
                        <th>Completion</th><th className="num">Time</th><th className="num">Flags</th>
                        {f.assessment === "medical-biller" && <th>Advanced RCM</th>}
                        <th>Retake after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.length === 0 && <tr><td colSpan={10} className="muted">No attempts match these filters.</td></tr>}
                      {list.map((a) => {
                        const flags = a.activity.filter((e) => e.type !== "right_click").length;
                        const rcm = rcmBy.get(a.email);
                        return (
                          <tr key={a.id}>
                            <td className="small">{dt(a.startedAt)}</td>
                            <td><Link href={`/admin/attempt/${a.id}`}><b>{a.name}</b></Link><div className="small muted">{a.email}</div></td>
                            <td className="small">{getMeta(a.slug)?.title}</td>
                            <td className="num">{a.score != null ? `${a.score}/${a.total}` : "—"}<div className="small muted">{a.percent != null ? `${a.percent}%` : ""}</div></td>
                            <td>{a.passed == null ? "—" : a.passed ? <span className="pill pill-good">✓ Pass</span> : <span className="pill pill-bad">✗ Fail</span>}</td>
                            <td>{a.status === "timed_out" ? <span className="pill pill-warn">⏱ Timed out</span> : a.status === "submitted" ? <span className="pill pill-neutral">Submitted</span> : <span className="pill pill-neutral">In progress</span>}</td>
                            <td className="num small">{a.submittedAt ? fmtDuration(Math.min(a.submittedAt, a.deadline) - a.startedAt) : "—"}</td>
                            <td className="num">{flags >= 3 ? <span className="pill pill-warn">⚑ {flags}</span> : flags}</td>
                            {f.assessment === "medical-biller" && (
                              <td className="small">{rcm ? <>{rcm.score}/{rcm.total} {rcm.passed ? "✓" : "✗"}</> : <span className="muted">—</span>}</td>
                            )}
                            <td className="small">{a.retakeAfter ? new Date(a.retakeAfter).toLocaleDateString("en-US") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          </>
        );
      }}
    </AdminGate>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}

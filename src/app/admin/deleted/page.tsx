import Link from "next/link";
import "../admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import { deletedAttempts } from "@/lib/attempts";
import { getMeta } from "@/content/assessments";

export const dynamic = "force-dynamic";
const dt = (ms?: number) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export default async function DeletedPage() {
  return (
    <AdminGate path="/admin/deleted">
      {async (user) => {
        const list = await deletedAttempts();
        return (
          <>
            <TopBar email={user.email} right={<Link className="small" href="/admin">Dashboard</Link>} />
            <main className="wrap-wide" style={{ maxWidth: 1040 }}>
              <Link href="/admin" className="small">← Back to dashboard</Link>
              <h1 style={{ marginTop: 12 }}>Deleted attempts</h1>
              <p className="muted">Hidden from the dashboard. Open one to see its answers or restore it.</p>
              <div className="panel">
                <div className="table-scroll candidates-scroll">
                  <table className="data">
                    <thead><tr><th>Deleted</th><th>Candidate</th><th>Assessment</th><th>Score</th><th>Deleted by</th><th>Reason</th></tr></thead>
                    <tbody>
                      {list.length === 0 && <tr><td colSpan={6} className="muted">No deleted attempts.</td></tr>}
                      {list.map((a) => (
                        <tr key={a.id}>
                          <td className="small">{dt(a.deletedAt)}</td>
                          <td><Link href={`/admin/attempt/${a.id}`}>{a.name}</Link><div className="small muted">{a.email}</div></td>
                          <td className="small">{getMeta(a.slug)?.title}</td>
                          <td className="small">{a.score != null ? `${a.score}/${a.total}` : "In progress"}</td>
                          <td className="small">{a.deletedBy}</td>
                          <td className="small">{a.deleteReason}</td>
                        </tr>
                      ))}
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

import Link from "next/link";
import TopBar from "@/components/TopBar";
import { ASSESSMENTS } from "@/content/assessments";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  return (
    <>
      <TopBar email={user?.email} right={<Link className="small" href="/admin">Evaluator dashboard</Link>} />
      <main className="wrap">
        <p className="eyebrow">My Mountain Mover</p>
        <h1>Skills assessments</h1>
        <p className="muted">
          Candidates receive the link for their assessment in their invite email. Each link below is the shared link to paste into the
          Salesforce email template.
        </p>
        <div className="card" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr><th>Assessment</th><th>Status</th><th>Shared link</th></tr>
            </thead>
            <tbody>
              {ASSESSMENTS.map((a) => (
                <tr key={a.slug}>
                  <td><b>{a.title}</b>{a.prerequisite && <div className="small muted">After Medical Biller</div>}</td>
                  <td>{a.status === "live" ? <span className="pill pill-good">Live</span> : <span className="pill pill-neutral">Coming soon</span>}</td>
                  <td><Link href={`/a/${a.slug}`}>/a/{a.slug}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

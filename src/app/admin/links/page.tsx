import Link from "next/link";
import "../admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import ReopenLink from "@/components/ReopenLink";
import { ASSESSMENTS } from "@/content/assessments";
import { expirySetting } from "@/lib/access";
import { isEditor } from "@/lib/evaluators";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  return (
    <AdminGate path="/admin/links">
      {async (user) => (
        <>
          <TopBar email={user.email} right={<Link className="small" href="/admin">Dashboard</Link>} />
          <main className="wrap-wide" style={{ maxWidth: 1040 }}>
            <Link href="/admin" className="small">← Back to dashboard</Link>
            <p className="eyebrow" style={{ marginTop: 12 }}>Assessment links</p>
            <h1>Link expiry</h1>
            <p className="muted" style={{ maxWidth: 760 }}>
              Every candidate gets the same link for an assessment. When link expiry is on, each candidate’s time starts when their invitation
              email was sent (if the link includes the send date) or when they first open the link, and after that they see “This assessment
              link has expired”. Someone already in the middle of an assessment can always finish it.
            </p>
            <ReopenLink assessments={ASSESSMENTS.map((a) => ({ slug: a.slug, title: a.title }))} initial={await expirySetting()} canEdit={await isEditor(user.email)} />
          </main>
        </>
      )}
    </AdminGate>
  );
}

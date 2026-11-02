import Link from "next/link";
import "../admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import MigrateButton from "@/components/MigrateButton";
import { isEditor } from "@/lib/evaluators";
import { migrationAvailable } from "@/lib/migrate";
import { storageKind } from "@/lib/db";
import { mediaProvider } from "@/lib/mediastore";

export const dynamic = "force-dynamic";

export default async function MigratePage() {
  return (
    <AdminGate path="/admin/migrate">
      {async (user) => {
        const editor = await isEditor(user.email);
        return (
          <>
            <TopBar email={user.email} right={<Link className="small" href="/admin">Dashboard</Link>} />
            <main className="wrap" style={{ maxWidth: 760 }}>
              <Link href="/admin" className="small">← Back to dashboard</Link>
              <h1 style={{ marginTop: 12 }}>Import data from the old app</h1>
              <p className="muted">
                Copies every attempt, candidate record, published question set, setting and uploaded file from the Vercel version of the app
                into Google (Firestore and Cloud Storage). Run it once before you start using this app for real, and once more right before you
                switch the Salesforce links. Running it again is safe: it copies everything again.
              </p>
              <div className="panel">
                <table className="data"><tbody>
                  <tr><td className="muted">This app stores data in</td><td><b>{storageKind === "firestore" ? "Firestore ✓" : storageKind}</b></td></tr>
                  <tr><td className="muted">Uploaded files go to</td><td><b>{mediaProvider === "gcs" ? "Cloud Storage ✓" : mediaProvider ?? "not set (MEDIA_BUCKET)"}</b></td></tr>
                  <tr><td className="muted">Old app’s storage</td><td><b>{migrationAvailable ? "connected ✓" : "not set (OLD_KV_REST_API_URL / OLD_KV_REST_API_TOKEN)"}</b></td></tr>
                </tbody></table>
                <div style={{ marginTop: 14 }}>
                  {!editor ? <p className="small muted">Only people who can edit the questions Sheet can run the import.</p>
                    : !migrationAvailable || storageKind !== "firestore" ? <p className="small muted">Add the missing settings in AI Studio → Settings → Secrets, redeploy, then come back here.</p>
                    : <MigrateButton />}
                </div>
              </div>
            </main>
          </>
        );
      }}
    </AdminGate>
  );
}

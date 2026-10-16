import Link from "next/link";
import "../admin.css";
import TopBar from "@/components/TopBar";
import AdminGate from "@/components/AdminGate";
import { canViewQuestions, isEditor } from "@/lib/evaluators";
import { questionsSeparate } from "@/lib/google";
import QuestionsManager from "@/components/QuestionsManager";
import { ASSESSMENTS } from "@/content/assessments";
import { getContent, allQuestions } from "@/content";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  return (
    <AdminGate path="/admin/questions" access="questions">
      {async (user) => {
        const canEdit = await isEditor(user.email);
        const live = await Promise.all(
          ASSESSMENTS.map(async (a) => {
            const c = await getContent(a.slug);
            return {
              slug: a.slug,
              title: a.title,
              version: c?.version ?? null,
              questions: c ? allQuestions(c).length : 0,
              publishedAt: c?.publishedAt ?? null,
              publishedBy: c?.publishedBy ?? null,
            };
          }),
        );
        return (
          <>
            <TopBar email={user.email} right={<Link className="small" href="/admin">Dashboard</Link>} />
            <main className="wrap-wide" style={{ maxWidth: 1040 }}>
              <Link href="/admin" className="small">← Back to dashboard</Link>
              <p className="eyebrow" style={{ marginTop: 12 }}>Question bank</p>
              <h1>Questions &amp; media</h1>
              <p className="muted" style={{ maxWidth: 760 }}>
                Edit questions in the {questionsSeparate ? "questions" : "results"} Sheet, in the tab named after each assessment (e.g. <b>Advanced RCM</b>), then check and publish them here. Publishing creates a new
                question-set version: candidates who start after that get the new questions, while attempts in progress and past results
                keep the version they were taken on.
              </p>
              {!canEdit && (
                <div className="notice notice-info small" style={{ marginBottom: 14 }}>
                  You can check and preview. Publishing and uploading are limited to people who can <b>edit</b> the {questionsSeparate ? "questions" : "results"} Sheet.
                </div>
              )}
              <QuestionsManager canEdit={canEdit} live={live} />
            </main>
          </>
        );
      }}
    </AdminGate>
  );
}

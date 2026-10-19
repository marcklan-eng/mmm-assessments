import { withEvaluator } from "@/lib/adminapi";
import { readQuestionTabs } from "@/lib/google";
import * as google from "@/lib/google";
import { parseQuestionTabs } from "@/lib/questionbank";

export const dynamic = "force-dynamic";

// Reads the Questions tab and reports what would be published (with row-by-row problems).
export async function GET() {
  return withEvaluator(async () => {
    const tabs = await readQuestionTabs();
    const parsed = await parseQuestionTabs(tabs);
    const hasContent = parsed.assessments.length > 0 || parsed.errors.length > 0;
    if (!hasContent) {
      // Nothing usable: report what the script sees, so the cause is obvious.
      const info = await google.questionsScriptInfo().catch(() => null);
      return {
        tab: false,
        sheetUrl: google.sheetUrl,
        diagnostics: {
          sheetName: info?.sheetName ?? null,
          scriptVersion: info?.scriptVersion ?? null,
          tabs: tabs.map((t) => ({ name: t.name, rows: Math.max(t.rows.length - 1, 0) })),
        },
      };
    }
    return { tab: true, sheetUrl: google.sheetUrl, ...parsed };
  }, "questions");
}

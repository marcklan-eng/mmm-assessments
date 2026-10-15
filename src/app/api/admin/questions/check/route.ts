import { withEvaluator } from "@/lib/adminapi";
import { readQuestionRows } from "@/lib/google";
import * as google from "@/lib/google";
import { parseQuestionRows } from "@/lib/questionbank";

export const dynamic = "force-dynamic";

// Reads the Questions tab and reports what would be published (with row-by-row problems).
export async function GET() {
  return withEvaluator(async () => {
    const rows = await readQuestionRows();
    if (!rows) return { tab: false, sheetUrl: google.sheetUrl };
    return { tab: true, sheetUrl: google.sheetUrl, ...(await parseQuestionRows(rows)) };
  });
}

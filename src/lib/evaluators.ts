import { DEMO_MODE } from "./auth";
import { questionsConfigured, questionsEditorEmails, questionsSharedEmails, sheetConfigured, sheetSharedEmails } from "./google";

const extra = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Open dashboard: demo mode with no Sheet and no ADMIN_EMAILS configured. */
export const dashboardOpenForDemo = DEMO_MODE && !sheetConfigured && extra.length === 0;

/** An evaluator is anyone the results Sheet is shared with by email (plus ADMIN_EMAILS). */
export async function isEvaluator(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (extra.includes(e)) return true;
  if (dashboardOpenForDemo) return true;
  if (!sheetConfigured) return false;
  try {
    return (await sheetSharedEmails()).has(e);
  } catch (err) {
    console.error("Could not read Sheet sharing list", err);
    return false;
  }
}

/** Can open the question bank (check + preview, which shows the answer key): anyone the questions Sheet is shared with. */
export async function canViewQuestions(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (extra.includes(e)) return true;
  if (dashboardOpenForDemo) return true;
  if (!questionsConfigured) return false;
  try {
    return (await questionsSharedEmails()).has(e);
  } catch (err) {
    console.error("Could not read questions Sheet sharing list", err);
    return false;
  }
}

/** Can publish questions and upload media: editors of the questions Sheet (plus ADMIN_EMAILS). */
export async function isEditor(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (extra.includes(e)) return true;
  if (dashboardOpenForDemo) return true;
  if (!questionsConfigured) return false;
  try {
    return (await questionsEditorEmails()).has(e);
  } catch (err) {
    console.error("Could not read questions Sheet sharing list", err);
    return false;
  }
}

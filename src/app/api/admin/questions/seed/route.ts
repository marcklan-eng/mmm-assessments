import { withEvaluator } from "@/lib/adminapi";
import { seedQuestionRows } from "@/lib/google";
import { seedRows } from "@/lib/questionbank";

export const dynamic = "force-dynamic";

// Creates the Questions tab, filled with the questions that are live now.
export async function POST() {
  return withEvaluator(async () => seedQuestionRows(await seedRows()), "editor");
}

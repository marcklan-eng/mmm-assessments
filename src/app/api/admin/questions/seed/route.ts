import { withEvaluator } from "@/lib/adminapi";
import { seedQuestionTabs } from "@/lib/google";
import { seedTabs } from "@/lib/questionbank";

export const dynamic = "force-dynamic";

// Creates the Questions tab, filled with the questions that are live now.
export async function POST() {
  return withEvaluator(async () => seedQuestionTabs(await seedTabs()), "editor");
}

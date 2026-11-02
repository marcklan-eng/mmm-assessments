import { withEvaluator } from "@/lib/adminapi";
import { runMigration } from "@/lib/migrate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Copies everything from the old Vercel storage into Firestore / Cloud Storage. Editors only.
export async function POST() {
  return withEvaluator(async () => runMigration(), "editor");
}

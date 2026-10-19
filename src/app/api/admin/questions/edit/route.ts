import { withEvaluator } from "@/lib/adminapi";
import { HttpError } from "@/lib/attempts";
import { editQuestionTab, readQuestionTabs, type QuestionEditOp } from "@/lib/google";
import { parseQuestionTabs, TAB_HEADERS } from "@/lib/questionbank";
import { ASSESSMENTS } from "@/content/assessments";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.trim().toLowerCase();
type Row = { row: number; cells: Record<string, string> };

async function loadTab(slug: string) {
  const meta = ASSESSMENTS.find((a) => a.slug === slug);
  if (!meta) throw new HttpError(400, "Unknown assessment.");
  const tab = (await readQuestionTabs()).find((t) => norm(t.name) === norm(meta.title));
  if (!tab || !tab.rows.length) throw new HttpError(400, `The questions Sheet has no "${meta.title}" tab yet.`);
  const header = tab.rows[0].map((h) => norm(String(h ?? "")));
  const toCells = (r: string[]) => Object.fromEntries(TAB_HEADERS.map((h) => [h, String(r[header.indexOf(norm(h))] ?? "")]).map(([h, v]) => [h, header.includes(norm(h)) ? v : ""]));
  const rows: Row[] = tab.rows.slice(1).map((r, i) => ({ row: i + 2, cells: toCells(r) })).filter((r) => Object.values(r.cells).some((v) => v.trim()));
  return { meta, tab, rows, toCells };
}

// The rows of one assessment's tab, for the editor.
export async function GET(req: Request) {
  return withEvaluator(async () => {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const { meta, rows } = await loadTab(slug);
    return { tab: meta.title, headers: TAB_HEADERS, rows };
  }, "editor");
}

// Saves one question: { slug, op: "update" | "insert" | "delete", row, before, values }.
// The change is checked first (exactly like "Check"); nothing is written if it would leave a problem.
export async function POST(req: Request) {
  return withEvaluator(async () => {
    const body = await req.json();
    const { slug, op, row } = body as { slug: string; op: string; row: number };
    const before = (body.before ?? {}) as Record<string, string>;
    const values = Object.fromEntries(
      Object.entries((body.values ?? {}) as Record<string, string>)
        .filter(([k]) => TAB_HEADERS.includes(k))
        .map(([k, v]) => [k, String(v ?? "").replace(/\r/g, "").trim()]),
    );
    const { meta, tab, rows } = await loadTab(slug);
    const cur = rows.find((r) => r.row === row);
    if (!cur) throw new HttpError(409, "That row isn't in the Sheet anymore. Close the editor and open it again.");
    for (const [k, v] of Object.entries(before)) {
      if ((cur.cells[k] ?? "").trim() !== String(v).trim()) {
        throw new HttpError(409, "This question was changed in the Sheet since you opened it. Close the editor, open it again and redo your change.");
      }
    }

    // Build the ops (and the tab as it would look after them, to check it).
    const ops: QuestionEditOp[] = [];
    const sim = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    if (op === "update") {
      ops.push({ op: "update", row, before: cur.cells, values });
      Object.assign(sim.find((r) => r.row === row)!.cells, values);
    } else if (op === "insert") {
      if (!values["Question"]) throw new HttpError(400, "Type the question first.");
      ops.push({ op: "insert", after: row, values });
      sim.splice(sim.findIndex((r) => r.row === row) + 1, 0, { row: -1, cells: { ...Object.fromEntries(TAB_HEADERS.map((h) => [h, ""])), ...values } });
    } else if (op === "delete") {
      ops.push({ op: "delete", row, before: cur.cells });
      const i = sim.findIndex((r) => r.row === row);
      const next = sim[i + 1];
      // Deleting a section's first question: its section details move to the next question of that section.
      if (cur.cells["Section"].trim() && next && !next.cells["Section"].trim()) {
        const moved: Record<string, string> = {};
        for (const h of ["Section", "Section Description", "Section Media"]) if (cur.cells[h].trim() && !next.cells[h].trim()) moved[h] = cur.cells[h];
        ops.push({ op: "update", row: next.row, before: next.cells, values: moved });
        Object.assign(next.cells, moved);
      }
      sim.splice(i, 1);
    } else throw new HttpError(400, "Unknown change.");

    const parsed = await parseQuestionTabs([{ name: tab.name, rows: [TAB_HEADERS, ...sim.map((r) => TAB_HEADERS.map((h) => r.cells[h] ?? ""))] }]);
    const a = parsed.assessments.find((x) => x.slug === meta.slug);
    const problems = [...parsed.errors, ...(a?.errors ?? [])].map((e) => e.message);
    if (!a) problems.push("The tab would have no questions left.");
    if (problems.length) throw new HttpError(400, `Not saved — ${problems.join(" ")}`);

    const r = await editQuestionTab(tab.name, ops);
    return { ok: true, insertedAt: r.insertedAt ?? null, questionCount: a!.questionCount, points: a!.points };
  }, "editor");
}

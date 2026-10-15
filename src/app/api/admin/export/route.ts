import { currentUser } from "@/lib/auth";
import { isEvaluator } from "@/lib/evaluators";
import { allAttempts } from "@/lib/attempts";
import { applyFilters, parseFilters } from "@/lib/stats";
import { attemptRow } from "@/lib/google";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // prevent spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !(await isEvaluator(user.email))) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const list = applyFilters(await allAttempts(), parseFilters(sp));
  // Group by assessment so columns line up (question columns differ per assessment).
  const lines: string[] = [];
  let lastHeader = "";
  for (const a of list.sort((x, y) => x.slug.localeCompare(y.slug) || y.startedAt - x.startedAt)) {
    const { headers, values } = attemptRow(a);
    const h = ["Assessment", ...headers].map(cell).join(",");
    if (h !== lastHeader) {
      if (lines.length) lines.push("");
      lines.push(h);
      lastHeader = h;
    }
    lines.push([a.slug, ...values].map(cell).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="assessment-results-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

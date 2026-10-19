import type { Attempt } from "./types";
import { allQuestions, type QuestionSet } from "@/content";
import { answerText, isAnswered, isCorrect, pointsEarned, pointsOf } from "@/content/answers";

export type Filters = {
  assessment: string; // slug or "all"
  from?: string; // yyyy-mm-dd
  to?: string;
  result: "all" | "pass" | "fail";
  completion: "all" | "submitted" | "timed_out" | "in_progress";
  q?: string;
};

export function parseFilters(sp: Record<string, string | undefined>): Filters {
  return {
    assessment: sp.assessment || "all",
    from: sp.from || undefined,
    to: sp.to || undefined,
    result: (["pass", "fail"].includes(sp.result ?? "") ? sp.result : "all") as Filters["result"],
    completion: (["submitted", "timed_out", "in_progress"].includes(sp.completion ?? "") ? sp.completion : "all") as Filters["completion"],
    q: sp.q?.trim() || undefined,
  };
}

export function applyFilters(list: Attempt[], f: Filters): Attempt[] {
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : -Infinity;
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity;
  const q = f.q?.toLowerCase();
  return list.filter((a) => {
    if (f.assessment !== "all" && a.slug !== f.assessment) return false;
    if (a.startedAt < from || a.startedAt > to) return false;
    if (f.result === "pass" && a.passed !== true) return false;
    if (f.result === "fail" && a.passed !== false) return false;
    if (f.completion !== "all" && a.status !== f.completion) return false;
    if (q && !a.name.toLowerCase().includes(q) && !a.email.includes(q)) return false;
    return true;
  });
}

export function overview(list: Attempt[]) {
  const done = list.filter((a) => a.status !== "in_progress");
  const passed = done.filter((a) => a.passed).length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const flagged = done.filter((a) => a.activity.filter((e) => e.type !== "right_click").length >= 3).length;
  return {
    started: list.length,
    completed: done.length,
    inProgress: list.length - done.length,
    submitted: done.filter((a) => a.status === "submitted").length,
    timedOut: done.filter((a) => a.status === "timed_out").length,
    passed,
    failed: done.length - passed,
    passRate: done.length ? (passed / done.length) * 100 : null,
    avgScore: avg(done.map((a) => a.percent ?? 0)),
    avgMinutes: avg(done.map((a) => (Math.min(a.submittedAt!, a.deadline) - a.startedAt) / 60000)),
    flagged,
  };
}

/** One row per role (assessment) for the all-roles view. */
export function roleBreakdown(list: Attempt[], roles: { slug: string; title: string }[]) {
  return roles.map((r) => ({ ...r, ...overview(list.filter((a) => a.slug === r.slug)) }));
}

/** Weekly buckets (weeks start Monday) for completed attempts. */
export function weeklyTrend(list: Attempt[]) {
  const done = list.filter((a) => a.status !== "in_progress" && a.submittedAt);
  const weekStart = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  const map = new Map<number, Attempt[]>();
  for (const a of done) {
    const k = weekStart(a.submittedAt!);
    map.set(k, [...(map.get(k) ?? []), a]);
  }
  if (map.size === 0) return [];
  const keys = [...map.keys()].sort((x, y) => x - y);
  const out = [];
  const last = keys[keys.length - 1];
  for (let k = keys[0]; k <= last; ) {
    const items = map.get(k) ?? [];
    const passed = items.filter((a) => a.passed).length;
    out.push({
      week: k,
      label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: items.length,
      passRate: items.length ? (passed / items.length) * 100 : null,
      avgScore: items.length ? items.reduce((s, a) => s + (a.percent ?? 0), 0) / items.length : null,
    });
    k = weekStart(k + 7 * 86400000 + 12 * 3600000); // next Monday, safe across DST changes
  }
  return out;
}

/** Per-item stats for one question-set version (only attempts taken on that version).
 *  A grid scored per row counts as one item per row, numbered like candidates see them. */
export function questionStats(list: Attempt[], content: QuestionSet) {
  const slug = content.slug;
  const done = list.filter((a) => a.status !== "in_progress" && a.slug === slug && (a.version ?? 0) === content.version);
  type Item = { id: string; section: string; prompt: string; correct: string; pick: (a: Attempt) => string | undefined; right: (v: string) => boolean; text: (v: string) => string };
  const items: Item[] = [];
  for (const s of content.sections) {
    for (const q of s.questions) {
      if (pointsOf(q) > 1 && q.rows) {
        const want = q.answer.split(",");
        const title = q.prompt.split("\n")[0];
        q.rows.forEach((r, ri) =>
          items.push({
            id: `${q.id}-${r.id}`,
            section: s.title,
            prompt: `${title}: ${r.text}`,
            correct: q.options.find((o) => o.id === want[ri])?.text ?? "",
            pick: (a) => (a.answers[q.id] ?? "").split(",")[ri] || undefined,
            right: (v) => v === want[ri],
            text: (v) => q.options.find((o) => o.id === v)?.text ?? "",
          }),
        );
      } else {
        items.push({
          id: q.id,
          section: s.title,
          prompt: q.prompt,
          correct: answerText(q, q.answer),
          pick: (a) => (isAnswered(q, a.answers[q.id]) ? a.answers[q.id] : undefined),
          right: (v) => isCorrect(q, v),
          text: (v) => answerText(q, v),
        });
      }
    }
  }
  return items
    .map((it, i) => {
      const counts: Record<string, number> = {};
      let wrong = 0;
      let blank = 0;
      for (const a of done) {
        const c = it.pick(a);
        if (!c) { blank++; wrong++; continue; }
        if (it.right(c)) continue;
        wrong++;
        counts[c] = (counts[c] ?? 0) + 1;
      }
      const topWrong = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      return {
        number: i + 1,
        id: it.id,
        section: it.section,
        prompt: it.prompt,
        correct: it.correct,
        takers: done.length,
        wrongPct: done.length ? (wrong / done.length) * 100 : 0,
        blank,
        topWrong: topWrong ? { text: it.text(topWrong[0]), pct: (topWrong[1] / done.length) * 100 } : null,
      };
    })
    .sort((a, b) => b.wrongPct - a.wrongPct || a.number - b.number);
}

export function sectionStats(list: Attempt[], content: QuestionSet) {
  const slug = content.slug;
  const done = list.filter((a) => a.status !== "in_progress" && a.slug === slug && (a.version ?? 0) === content.version);
  return content.sections.map((s) => {
    let right = 0;
    for (const a of done) for (const q of s.questions) right += pointsEarned(q, a.answers[q.id]);
    const possible = done.length * s.questions.reduce((t, q) => t + pointsOf(q), 0);
    return { title: s.title, pct: possible ? (right / possible) * 100 : null };
  });
}

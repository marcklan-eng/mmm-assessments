import type { Attempt } from "./types";
import { allQuestions, type QuestionSet } from "@/content";
import { answerText, isAnswered } from "@/content/answers";

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
    assessment: sp.assessment || "medical-biller",
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

/** Per-question stats for one question-set version (only attempts taken on that version). */
export function questionStats(list: Attempt[], content: QuestionSet) {
  const slug = content.slug;
  const done = list.filter((a) => a.status !== "in_progress" && a.slug === slug && (a.version ?? 0) === content.version);
  return allQuestions(content)
    .map((q, i) => {
      const counts: Record<string, number> = {};
      let wrong = 0;
      let blank = 0;
      for (const a of done) {
        const c = a.answers[q.id];
        if (!isAnswered(q, c)) { blank++; wrong++; continue; }
        counts[c] = (counts[c] ?? 0) + 1;
        if (c !== q.answer) wrong++;
      }
      const topWrong = Object.entries(counts)
        .filter(([id]) => id !== q.answer)
        .sort((x, y) => y[1] - x[1])[0];
      const section = content.sections.find((s) => s.questions.includes(q))!;
      return {
        number: i + 1,
        id: q.id,
        section: section.title,
        prompt: q.prompt,
        correct: answerText(q, q.answer),
        takers: done.length,
        wrongPct: done.length ? (wrong / done.length) * 100 : 0,
        blank,
        topWrong: topWrong ? { text: answerText(q, topWrong[0]), pct: (topWrong[1] / done.length) * 100 } : null,
      };
    })
    .sort((a, b) => b.wrongPct - a.wrongPct || a.number - b.number);
}

export function sectionStats(list: Attempt[], content: QuestionSet) {
  const slug = content.slug;
  const done = list.filter((a) => a.status !== "in_progress" && a.slug === slug && (a.version ?? 0) === content.version);
  return content.sections.map((s) => {
    let right = 0;
    for (const a of done) for (const q of s.questions) if (a.answers[q.id] === q.answer) right++;
    const possible = done.length * s.questions.length;
    return { title: s.title, pct: possible ? (right / possible) * 100 : null };
  });
}

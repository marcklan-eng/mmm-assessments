// Turns the questions Sheet into question sets, with row-by-row checks.
//
// The Sheet has one tab per assessment, named exactly like the assessment (e.g. "Advanced RCM"),
// and/or a single "Questions" tab with an Assessment column. Columns (header names, any order):
//   [Assessment] | Section | Section Description | Section Media | Question | A | B | C | D | E | F | Correct | Rows
// - One row per question, in the order candidates will see them.
// - Section / Section Description / Section Media only need to be filled on a section's first row.
// - Section Media: one file per line, as "file-name.png | Caption" (the caption is optional).
//   Add a line "Layout: side by side" to show the images in a row (each with Zoom) instead of full width.
// - Correct: the letter of the right choice (A–F). Several letters ("A, D") with no Rows makes a
//   "check all that apply" question: 1 point when exactly those choices are checked.
// - Question Media (optional): images shown with that question, same format as Section Media.
// - Short answer: leave A–F blank and type the accepted answer in Correct (several on separate lines).
//   Case, spacing and punctuation don't matter, and dates match in any format (06/18/1987 = June 18, 1987).
// - Rows (optional): makes a matching grid. One item per line; candidates pick one choice (A–F) per row.
//   Correct then lists one letter per row, in order, e.g. "A, B". Scored as one point, all or nothing,
//   unless Scoring says "Per row" (1 point for each row answered correctly).
import { ASSESSMENTS } from "@/content/assessments";
import { allQuestions, builtIn, getContent, type QuestionSet } from "@/content";
import type { AssessmentContent, Section, Stimulus } from "@/content/types";
import { availableMedia, mediaKind } from "./media";
import { blankCount, parseAcceptedNumber, totalItems, totalPoints } from "@/content/answers";

export const QUESTION_HEADERS = [
  "Assessment",
  "Section",
  "Section Description",
  "Section Media",
  "Question",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "Correct",
  "Rows",
  "Scoring",
  "Question Media",
  "Type",
];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type Issue = { row: number; message: string; where?: string };
export type ParsedAssessment = {
  slug: string;
  title: string;
  content: AssessmentContent;
  questionCount: number;
  points: number;
  sectionCount: number;
  errors: Issue[];
  warnings: Issue[];
  changed: boolean; // differs from what's live now
  currentVersion: number | null;
};
export type ParseResult = { assessments: ParsedAssessment[]; errors: Issue[] };

const norm = (s: string) => s.trim().toLowerCase();

function defaultIntro(title: string): string[] {
  return [
    `This assessment measures your skills for the ${title} role.`,
    "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
  ];
}

const LAYOUT_LINE = /^layout\s*:/i;

function parseMedia(cell: string, row: number, issues: Issue[]): Stimulus[] {
  return cell
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter((l) => l && !LAYOUT_LINE.test(l))
    .flatMap((line) => {
      const [file, ...cap] = line.split("|");
      const name = file.trim();
      const kind = mediaKind(name);
      if (!kind) {
        issues.push({ row, message: `"${name}" isn't an image, video or audio file name (use .png, .jpg, .mp4, .mp3, …).` });
        return [];
      }
      return [{ type: kind, file: name, caption: cap.join("|").trim() || name } as Stimulus];
    });
}

/** Strip volatile fields so two sets can be compared. */
function fingerprint(c: AssessmentContent) {
  return JSON.stringify(c.sections.map((s) => [s.title, s.description, s.stimuli, s.layout ?? null, s.questions.map((q) => [q.prompt, q.options, q.rows ?? null, q.scoring ?? null, q.multi ?? null, q.points ?? null, q.media ?? null, q.kind ?? null, q.answer])]));
}

/** Header for a per-assessment tab (no Assessment column needed). */
export const TAB_HEADERS = QUESTION_HEADERS.filter((h) => h !== "Assessment");

/** Tabs for people, not questions (e.g. "Instructions"), are skipped silently. */
export function isNoteTab(name: string): boolean {
  return /^(instructions?|how to|readme|notes?|help)\b/i.test(name.trim()) || name.trim().startsWith("_");
}

/** Combines the Sheet's tabs into one table with the standard columns, remembering where each row came from. */
export function combineTabs(tabs: { name: string; rows: string[][] }[]): { rows: string[][]; labels: string[]; errors: Issue[] } {
  const rows: string[][] = [QUESTION_HEADERS];
  const labels: string[] = [];
  const errors: Issue[] = [];
  for (const t of tabs) {
    const data = t.rows.slice(1).filter((r) => r.some((v) => String(v ?? "").trim()));
    if (!t.rows.length || !data.length || isNoteTab(t.name)) continue;
    const meta = ASSESSMENTS.find((a) => norm(a.title) === norm(t.name));
    const isQuestionsTab = norm(t.name) === "questions";
    if (!meta && !isQuestionsTab) {
      errors.push({ row: 0, message: `Tab "${t.name}" doesn't match an assessment name, so it was skipped. Rename it to one of: ${ASSESSMENTS.map((a) => a.title).join(", ")}.` });
      continue;
    }
    const header = t.rows[0].map((h) => norm(String(h ?? "")));
    for (const h of ["Section", "Question", "A", "B", "Correct"]) {
      if (!header.includes(h.toLowerCase())) errors.push({ row: 1, where: `${t.name} tab`, message: `Missing column "${h}" in row 1.` });
    }
    t.rows.slice(1).forEach((r, i) => {
      if (!r.some((v) => String(v ?? "").trim())) return;
      rows.push(
        QUESTION_HEADERS.map((h) => {
          if (h === "Assessment" && meta) return meta.title;
          const k = header.indexOf(h.toLowerCase());
          return k === -1 ? "" : String(r[k] ?? "");
        }),
      );
      labels.push(`${t.name} tab, row ${i + 2}`);
    });
  }
  return { rows, labels, errors };
}

export async function parseQuestionTabs(tabs: { name: string; rows: string[][] }[]): Promise<ParseResult> {
  const c = combineTabs(tabs);
  if (c.rows.length === 1) return { assessments: [], errors: c.errors };
  const r = await parseQuestionRows(c.rows, c.labels);
  return { ...r, errors: [...c.errors, ...r.errors] };
}

export async function parseQuestionRows(rows: string[][], labels?: string[]): Promise<ParseResult> {
  const errors: Issue[] = [];
  if (!rows.length) return { assessments: [], errors: [{ row: 1, message: "The Questions tab is empty." }] };

  const header = rows[0].map(norm);
  const col = (name: string) => header.indexOf(name.toLowerCase());
  for (const h of ["Assessment", "Section", "Question", "A", "B", "Correct"]) {
    if (col(h) === -1) errors.push({ row: 1, message: `Missing column "${h}" in the header row.` });
  }
  if (errors.length) return { assessments: [], errors };

  const cell = (r: string[], name: string) => {
    const i = col(name);
    return i === -1 ? "" : String(r[i] ?? "").trim();
  };

  type Draft = { title: string; sections: Section[]; errors: Issue[]; warnings: Issue[]; seen: Set<string> };
  const drafts = new Map<string, Draft>();
  let lastAssessment = "";
  let lastSection = "";

  const whereOf = (rowNum: number) => labels?.[rowNum - 2];
  rows.slice(1).forEach((r, i) => {
    const rowNum = i + 2;
    if (r.every((v) => !String(v ?? "").trim())) return; // blank row

    const aName = cell(r, "Assessment") || lastAssessment;
    const meta = ASSESSMENTS.find((a) => norm(a.title) === norm(aName));
    if (!meta) {
      errors.push({ row: rowNum, where: whereOf(rowNum), message: aName ? `Unknown assessment "${aName}". Use one of: ${ASSESSMENTS.map((a) => a.title).join(", ")}.` : "Assessment is blank." });
      return;
    }
    if (norm(aName) !== norm(lastAssessment)) lastSection = "";
    lastAssessment = aName;

    let d = drafts.get(meta.slug);
    if (!d) {
      d = { title: meta.title, sections: [], errors: [], warnings: [], seen: new Set() };
      drafts.set(meta.slug, d);
    }

    const sName = cell(r, "Section") || lastSection;
    if (!sName) {
      d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "Section is blank." });
      return;
    }
    lastSection = sName;
    let section = d.sections[d.sections.length - 1];
    if (!section || norm(section.title) !== norm(sName)) {
      if (d.sections.some((s) => norm(s.title) === norm(sName))) {
        d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: `Section "${sName}" appears again after another section; it will show as a separate page.` });
      }
      section = { id: `s${d.sections.length + 1}`, title: sName, description: "", stimuli: [], questions: [] };
      d.sections.push(section);
    }
    const desc = cell(r, "Section Description");
    if (desc && !section.description) section.description = desc;
    const media = cell(r, "Section Media");
    if (media && !(section.stimuli ?? []).length) {
      section.stimuli = parseMedia(media, rowNum, d.errors);
      const layout = media.split(/\n|;/).map((l) => l.trim()).find((l) => LAYOUT_LINE.test(l));
      if (layout) {
        const v = layout.replace(LAYOUT_LINE, "").toLowerCase().replace(/[^a-z]/g, "");
        if (["sidebyside", "row", "sidebysides"].includes(v)) section.layout = "side-by-side";
        else if (!["fullwidth", "full", "default"].includes(v)) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `"${layout}" — use "Layout: side by side" (or leave the line out for full width).` });
      }
    }

    const prompt = cell(r, "Question");
    if (!prompt) {
      // a row with only section info is fine
      if (!desc && !media) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "Question is blank." });
      return;
    }
    const qMediaCell = cell(r, "Question Media");
    const qMedia = qMediaCell ? parseMedia(qMediaCell, rowNum, d.errors) : [];
    const err = (message: string) => d!.errors.push({ row: rowNum, where: whereOf(rowNum), message });
    const typeRaw = cell(r, "Type");
    const typeKey = typeRaw.toLowerCase().replace(/[^a-z]/g, "");
    const TYPES: Record<string, string> = {
      putinorder: "order", order: "order", ordering: "order", ranking: "order", rank: "order", sequence: "order",
      number: "number", numeric: "number", numberanswer: "number", amount: "number",
      dropdown: "dropdown", select: "dropdown", dropdownlist: "dropdown",
      matching: "match", match: "match",
      fillintheblanks: "blanks", fillintheblank: "blanks", blanks: "blanks", blank: "blanks", fillin: "blanks",
      truefalse: "truefalse", tf: "truefalse",
      "": "", singlechoice: "", multiplechoice: "", checkall: "", checkallthatapply: "", typedanswer: "", typed: "", shortanswer: "", date: "", grid: "",
    };
    const kind = TYPES[typeKey];
    if (kind === undefined) {
      err(`Type "${typeRaw}" isn't a question type. Use Put in order, Number, Dropdown, Matching, Fill in the blanks, True/False, or leave it blank.`);
      return;
    }
    const scoringRaw = cell(r, "Scoring");
    const scoringKey = scoringRaw.toLowerCase().replace(/[^a-z]/g, "");
    const ptsM = scoringRaw.match(/^\s*(\d+(?:\.\d+)?)\s*(?:points?|pts?)?\s*$/i);
    const fixedPts = ptsM ? Number(ptsM[1]) : null;
    const own = kind === "order" || kind === "blanks" || kind === "number"; // the generic path checks Scoring for the others
    if (own && fixedPts != null && !(fixedPts > 0 && fixedPts <= 20)) err(`Scoring "${scoringRaw}" should be a number of points between 1 and 20.`);
    const partial = ["peritem", "perblank", "perrow", "partial", "partialcredit", "eachitem", "perposition"].includes(scoringKey);
    if (own && scoringRaw && fixedPts == null && !partial && !["allornothing", "all", "default", "perrow", "eachrow", "perrows", "oneperrow"].includes(scoringKey)) {
      err(`Scoring should be "Per item", a number of points (e.g. 2), or blank (1 point), not "${scoringRaw}".`);
    }
    const qNum = () => d!.sections.reduce((t, s2) => t + s2.questions.length, 0) + 1;
    const seen = () => {
      if (d!.seen.has(norm(prompt))) d!.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "This question text appears more than once." });
      d!.seen.add(norm(prompt));
    };
    const anyChoice = LETTERS.some((L) => cell(r, L));
    if (kind === "number" || kind === "blanks") {
      if (anyChoice) err(`A ${kind === "number" ? "Number" : "Fill in the blanks"} question has no choices: leave A–F empty.`);
      const lines = cell(r, "Correct").split("\n").map((x) => x.trim()).filter(Boolean);
      if (kind === "number") {
        if (!lines.length) err("Correct is blank. Enter the right number, e.g. 125.40 (or 125.40 ± 0.01 to allow a small difference).");
        const bad = lines.find((l) => !parseAcceptedNumber(l));
        if (bad) err(`"${bad}" in Correct isn't a number. Use e.g. 125.40, $1,250 or 125.40 ± 0.01.`);
        if (partial) d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "Per item scoring doesn't apply to a Number question; ignored." });
      } else {
        const n = blankCount(prompt);
        if (!n) err('Mark each blank in the question with ___ (three underscores).');
        else if (lines.length !== n) err(`The question has ${n} blank${n === 1 ? "" : "s"}, so Correct needs ${n} line${n === 1 ? "" : "s"} (one per blank; separate other accepted answers with |), not ${lines.length}.`);
      }
      seen();
      const n = qNum();
      section.questions.push({
        id: `q${String(n).padStart(2, "0")}`, prompt, options: [], kind,
        ...(kind === "blanks" && partial ? { scoring: "partial" as const } : {}),
        ...(fixedPts != null && fixedPts !== 1 && !(kind === "blanks" && partial) ? { points: fixedPts } : {}),
        ...(qMedia.length ? { media: qMedia } : {}),
        answer: lines.join("\n"),
      });
      return;
    }
    if (kind === "order") {
      const items = LETTERS.map((L) => ({ L, t: cell(r, L) })).filter((x) => x.t);
      const want = cell(r, "Correct").toUpperCase().replace(/[^A-F]/g, "").split("").filter(Boolean);
      if (items.length < 2) err("Put in order needs at least 2 items in A–F (in the order candidates first see them).");
      if (cell(r, "Rows")) err("Put in order doesn't use Rows: put the items in A–F.");
      if (want.length !== items.length || new Set(want).size !== want.length || want.some((L) => !items.some((x) => x.L === L))) {
        err(`Correct must list every item once, in the right order, e.g. "${items.map((x) => x.L).reverse().join(", ")}".`);
      } else if (want.join() === items.map((x) => x.L).join()) {
        d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "The items in A–F are already in the correct order, so candidates would see the answer. Mix them up in A–F." });
      }
      seen();
      const n = qNum();
      section.questions.push({
        id: `q${String(n).padStart(2, "0")}`, prompt, kind: "order",
        options: items.map((x) => ({ id: x.L.toLowerCase(), text: x.t })),
        ...(partial ? { scoring: "partial" as const } : {}),
        ...(fixedPts != null && fixedPts !== 1 && !partial ? { points: fixedPts } : {}),
        ...(qMedia.length ? { media: qMedia } : {}),
        answer: want.map((L) => L.toLowerCase()).join(","),
      });
      return;
    }
    if (kind === "truefalse") {
      const filledTF = LETTERS.map((L) => cell(r, L)).filter(Boolean);
      if (filledTF.length !== 2) err("A True/False question has exactly 2 choices: A = True, B = False.");
    }
    if (kind === "dropdown" && (cell(r, "Rows") || cell(r, "Correct").toUpperCase().replace(/[^A-F]/g, "").length > 1)) err("A Dropdown question has one correct letter and no Rows.");
    if (kind === "match" && !cell(r, "Rows")) err("A Matching question needs the items to match in Rows (one per line) and the answers in A–F.");
    const choices = LETTERS.map((L) => ({ letter: L, text: cell(r, L) }));
    const lastFilled = Math.max(...choices.map((c, k) => (c.text ? k : -1)));
    const gap = choices.slice(0, lastFilled + 1).find((c) => !c.text);
    if (gap) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Choice ${gap.letter} is blank but a later choice is filled.` });
    const filled = choices.filter((c) => c.text);
    const gridRows0 = cell(r, "Rows").trim();
    if (!filled.length && !gridRows0) {
      // Short answer: the candidate types it; Correct holds the accepted answer(s), one per line.
      const accepted = cell(r, "Correct").split("\n").map((x) => x.trim()).filter(Boolean);
      if (!accepted.length) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "Correct is blank. For a typed-answer question (no choices), enter the accepted answer." });
      if (d.seen.has(norm(prompt))) d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "This question text appears more than once." });
      d.seen.add(norm(prompt));
      const n = d.sections.reduce((t, s) => t + s.questions.length, 0) + 1;
      section.questions.push({ id: `q${String(n).padStart(2, "0")}`, prompt, options: [], ...(qMedia.length ? { media: qMedia } : {}), answer: accepted.join("\n") });
      return;
    }
    if (filled.length < 2) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "A question needs at least 2 choices (A and B), or none for a typed answer." });

    const gridRows = cell(r, "Rows").split("\n").map((x) => x.trim()).filter(Boolean);
    const scoringCell = norm(cell(r, "Scoring")).replace(/[^a-z]/g, "");
    let perRow = false;
    const pointsMatch = cell(r, "Scoring").match(/^\s*(\d+(?:\.\d+)?)\s*(?:points?|pts?)?\s*$/i);
    const pts = pointsMatch ? Number(pointsMatch[1]) : null;
    if (pts != null) {
      if (!(pts > 0 && pts <= 20)) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Scoring "${cell(r, "Scoring")}" should be a number of points between 1 and 20.` });
    } else if (["perrow", "eachrow", "perrows", "1perrow", "oneperrow", "partial"].includes(scoringCell)) perRow = true;
    else if (scoringCell && !["allornothing", "all", "default"].includes(scoringCell)) {
      d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Scoring should be "Per row", a number of points (e.g. 2), or blank (1 point), not "${cell(r, "Scoring")}".` });
    }
    if (perRow && !gridRows.length) d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: `Scoring "Per row" only applies to matching grids (questions with Rows); ignored here.` });
    const correct = cell(r, "Correct").toUpperCase().replace(/[^A-F]/g, "");
    if (!correct) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "Correct is blank. Enter the letter of the right choice (A–F)." });
    else if (gridRows.length) {
      if (gridRows.length < 2) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: "A matching grid needs at least 2 rows (one per line in the Rows cell)." });
      if (correct.length !== gridRows.length) {
        d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `This grid has ${gridRows.length} rows, so Correct needs ${gridRows.length} letters (one per row, e.g. "A, B"), not "${cell(r, "Correct")}".` });
      } else {
        const bad = [...correct].find((L) => !filled.some((c) => c.letter === L));
        if (bad) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Correct uses ${bad}, but choice ${bad} is blank.` });
      }
    } else if (correct.length > 1) {
      if (new Set(correct).size !== correct.length) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Correct lists the same letter twice ("${cell(r, "Correct")}").` });
      const bad = [...correct].find((L) => !filled.some((c) => c.letter === L));
      if (bad) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Correct uses ${bad}, but choice ${bad} is blank.` });
    } else if (!filled.some((c) => c.letter === correct)) d.errors.push({ row: rowNum, where: whereOf(rowNum), message: `Correct is ${correct}, but choice ${correct} is blank.` });

    const texts = filled.map((c) => norm(c.text));
    if (new Set(texts).size !== texts.length) d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "Two choices have the same text." });
    if (d.seen.has(norm(prompt))) d.warnings.push({ row: rowNum, where: whereOf(rowNum), message: "This question text appears more than once." });
    d.seen.add(norm(prompt));

    const n = d.sections.reduce((t, s) => t + s.questions.length, 0) + 1;
    section.questions.push({
      id: `q${String(n).padStart(2, "0")}`,
      prompt,
      options: filled.map((c) => ({ id: c.letter.toLowerCase(), text: c.text })),
      ...(gridRows.length ? { rows: gridRows.map((t, k) => ({ id: `r${k + 1}`, text: t })) } : {}),
      ...(gridRows.length && perRow ? { scoring: "per-row" as const } : {}),
      ...(!gridRows.length && correct.length > 1 ? { multi: true } : {}),
      ...(pts != null && pts > 0 && pts !== 1 && !perRow ? { points: pts } : {}),
      ...(qMedia.length ? { media: qMedia } : {}),
      ...(kind === "dropdown" || kind === "match" ? { kind: kind as "dropdown" | "match" } : {}),
      answer: gridRows.length
        ? [...correct].map((L) => L.toLowerCase()).join(",")
        : correct.length > 1
          ? [...new Set(correct)].map((L) => L.toLowerCase()).sort().join(",")
          : correct.toLowerCase(),
    });
  });

  // Look up every assessment's media and live version at the same time (much faster than one by one).
  const assessments: ParsedAssessment[] = await Promise.all([...drafts].map(async ([slug, d]) => {
    const [available, current] = await Promise.all([availableMedia(slug), getContent(slug)]);
    d.sections.forEach((s) => {
      if (!s.questions.length) d.errors.push({ row: 0, message: `Section "${s.title}" has no questions.` });
      [...(s.stimuli ?? []), ...s.questions.flatMap((q) => q.media ?? [])].forEach((st) => {
        if (!available.has(st.file)) d.errors.push({ row: 0, message: `"${st.file}" (section "${s.title}") hasn't been uploaded yet.` });
      });
    });
    const content: AssessmentContent = {
      slug,
      intro: (current ?? builtIn(slug))?.intro ?? ASSESSMENTS.find((a) => a.slug === slug)?.intro ?? defaultIntro(d.title),
      sections: d.sections,
    };
    return {
      slug,
      title: d.title,
      content,
      questionCount: totalItems(allQuestions(content)), // numbered items (a per-row grid counts once per row)
      points: totalPoints(allQuestions(content)),
      sectionCount: d.sections.length,
      errors: d.errors,
      warnings: d.warnings,
      changed: !current || fingerprint(current) !== fingerprint(content),
      currentVersion: current?.version ?? null,
    };
  }));
  assessments.sort((a, b) => ASSESSMENTS.findIndex((x) => x.slug === a.slug) - ASSESSMENTS.findIndex((x) => x.slug === b.slug));
  return { assessments, errors };
}

/** One tab per assessment that has live questions, filled from what's live now. */
export async function seedTabs(): Promise<{ name: string; rows: string[][] }[]> {
  const tabs: { name: string; rows: string[][] }[] = [];
  for (const meta of ASSESSMENTS) {
    const c: QuestionSet | undefined = await getContent(meta.slug);
    if (!c) continue;
    const rows: string[][] = [TAB_HEADERS];
    tabs.push({ name: meta.title, rows });
    for (const s of c.sections) {
      s.questions.forEach((q, i) => {
        const first = i === 0;
        const letters = q.options.map((o) => o.id.toUpperCase());
        rows.push([
          s.title,
          first ? s.description ?? "" : "",
          first ? [...(s.stimuli ?? []).map((st) => `${st.file} | ${st.caption}`), ...(s.layout ? ["Layout: side by side"] : [])].join("\n") : "",
          q.prompt,
          ...LETTERS.map((L) => q.options[letters.indexOf(L)]?.text ?? ""),
          !q.options.length ? q.answer : q.rows?.length || q.multi || q.kind === "order" ? q.answer.toUpperCase().split(",").join(", ") : q.answer.toUpperCase(),
          (q.rows ?? []).map((x) => x.text).join("\n"),
          q.scoring === "per-row" ? "Per row" : q.scoring === "partial" ? "Per item" : q.points ? String(q.points) : "",
          (q.media ?? []).map((st) => `${st.file} | ${st.caption}`).join("\n"),
          ({ order: "Put in order", number: "Number", dropdown: "Dropdown", match: "Matching", blanks: "Fill in the blanks" } as Record<string, string>)[q.kind ?? ""] ?? "",
        ]);
      });
    }
  }
  return tabs;
}

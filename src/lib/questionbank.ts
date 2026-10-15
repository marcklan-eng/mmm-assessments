// Turns the "Questions" tab of the results Sheet into question sets, with row-by-row checks.
//
// Questions tab columns (header names, any order):
//   Assessment | Section | Section Description | Section Media | Question | A | B | C | D | E | F | Correct
// - One row per question, in the order candidates will see them.
// - Section / Section Description / Section Media only need to be filled on a section's first row.
// - Section Media: one file per line, as "file-name.png | Caption" (the caption is optional).
// - Correct: the letter of the right choice (A–F).
import { ASSESSMENTS } from "@/content/assessments";
import { allQuestions, builtIn, getContent, type QuestionSet } from "@/content";
import type { AssessmentContent, Section, Stimulus } from "@/content/types";
import { availableMedia, mediaKind } from "./media";

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
];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type Issue = { row: number; message: string };
export type ParsedAssessment = {
  slug: string;
  title: string;
  content: AssessmentContent;
  questionCount: number;
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

function parseMedia(cell: string, row: number, issues: Issue[]): Stimulus[] {
  return cell
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [file, ...cap] = line.split("|");
      const name = file.trim();
      const kind = mediaKind(name);
      if (!kind) {
        issues.push({ row, message: `"${name}" isn't an image or video file name (use .png, .jpg, .mp4, …).` });
        return [];
      }
      return [{ type: kind, file: name, caption: cap.join("|").trim() || name } as Stimulus];
    });
}

/** Strip volatile fields so two sets can be compared. */
function fingerprint(c: AssessmentContent) {
  return JSON.stringify(c.sections.map((s) => [s.title, s.description, s.stimuli, s.questions.map((q) => [q.prompt, q.options, q.answer])]));
}

export async function parseQuestionRows(rows: string[][]): Promise<ParseResult> {
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

  rows.slice(1).forEach((r, i) => {
    const rowNum = i + 2;
    if (r.every((v) => !String(v ?? "").trim())) return; // blank row

    const aName = cell(r, "Assessment") || lastAssessment;
    const meta = ASSESSMENTS.find((a) => norm(a.title) === norm(aName));
    if (!meta) {
      errors.push({ row: rowNum, message: aName ? `Unknown assessment "${aName}". Use one of: ${ASSESSMENTS.map((a) => a.title).join(", ")}.` : "Assessment is blank." });
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
      d.errors.push({ row: rowNum, message: "Section is blank." });
      return;
    }
    lastSection = sName;
    let section = d.sections[d.sections.length - 1];
    if (!section || norm(section.title) !== norm(sName)) {
      if (d.sections.some((s) => norm(s.title) === norm(sName))) {
        d.warnings.push({ row: rowNum, message: `Section "${sName}" appears again after another section; it will show as a separate page.` });
      }
      section = { id: `s${d.sections.length + 1}`, title: sName, description: "", stimuli: [], questions: [] };
      d.sections.push(section);
    }
    const desc = cell(r, "Section Description");
    if (desc && !section.description) section.description = desc;
    const media = cell(r, "Section Media");
    if (media && !(section.stimuli ?? []).length) section.stimuli = parseMedia(media, rowNum, d.errors);

    const prompt = cell(r, "Question");
    if (!prompt) {
      // a row with only section info is fine
      if (!desc && !media) d.errors.push({ row: rowNum, message: "Question is blank." });
      return;
    }
    const choices = LETTERS.map((L) => ({ letter: L, text: cell(r, L) }));
    const lastFilled = Math.max(...choices.map((c, k) => (c.text ? k : -1)));
    const gap = choices.slice(0, lastFilled + 1).find((c) => !c.text);
    if (gap) d.errors.push({ row: rowNum, message: `Choice ${gap.letter} is blank but a later choice is filled.` });
    const filled = choices.filter((c) => c.text);
    if (filled.length < 2) d.errors.push({ row: rowNum, message: "A question needs at least 2 choices (A and B)." });

    const correct = cell(r, "Correct").toUpperCase().replace(/[^A-F]/g, "");
    if (!correct) d.errors.push({ row: rowNum, message: "Correct is blank. Enter the letter of the right choice (A–F)." });
    else if (correct.length > 1) d.errors.push({ row: rowNum, message: `Correct should be one letter, not "${cell(r, "Correct")}".` });
    else if (!filled.some((c) => c.letter === correct)) d.errors.push({ row: rowNum, message: `Correct is ${correct}, but choice ${correct} is blank.` });

    const texts = filled.map((c) => norm(c.text));
    if (new Set(texts).size !== texts.length) d.warnings.push({ row: rowNum, message: "Two choices have the same text." });
    if (d.seen.has(norm(prompt))) d.warnings.push({ row: rowNum, message: "This question text appears more than once." });
    d.seen.add(norm(prompt));

    const n = d.sections.reduce((t, s) => t + s.questions.length, 0) + 1;
    section.questions.push({
      id: `q${String(n).padStart(2, "0")}`,
      prompt,
      options: filled.map((c) => ({ id: c.letter.toLowerCase(), text: c.text })),
      answer: correct.toLowerCase(),
    });
  });

  const assessments: ParsedAssessment[] = [];
  for (const [slug, d] of drafts) {
    const available = await availableMedia(slug);
    d.sections.forEach((s) => {
      if (!s.questions.length) d.errors.push({ row: 0, message: `Section "${s.title}" has no questions.` });
      (s.stimuli ?? []).forEach((st) => {
        if (!available.has(st.file)) d.errors.push({ row: 0, message: `"${st.file}" (section "${s.title}") hasn't been uploaded yet.` });
      });
    });
    const current = await getContent(slug);
    const content: AssessmentContent = {
      slug,
      intro: (current ?? builtIn(slug))?.intro ?? defaultIntro(d.title),
      sections: d.sections,
    };
    assessments.push({
      slug,
      title: d.title,
      content,
      questionCount: allQuestions(content).length,
      sectionCount: d.sections.length,
      errors: d.errors,
      warnings: d.warnings,
      changed: !current || fingerprint(current) !== fingerprint(content),
      currentVersion: current?.version ?? null,
    });
  }
  assessments.sort((a, b) => ASSESSMENTS.findIndex((x) => x.slug === a.slug) - ASSESSMENTS.findIndex((x) => x.slug === b.slug));
  return { assessments, errors };
}

/** Rows for a fresh Questions tab, filled from what's live now. */
export async function seedRows(): Promise<string[][]> {
  const rows: string[][] = [QUESTION_HEADERS];
  for (const meta of ASSESSMENTS) {
    const c: QuestionSet | undefined = await getContent(meta.slug);
    if (!c) continue;
    for (const s of c.sections) {
      s.questions.forEach((q, i) => {
        const first = i === 0;
        const letters = q.options.map((o) => o.id.toUpperCase());
        rows.push([
          meta.title,
          s.title,
          first ? s.description ?? "" : "",
          first ? (s.stimuli ?? []).map((st) => `${st.file} | ${st.caption}`).join("\n") : "",
          q.prompt,
          ...LETTERS.map((L) => q.options[letters.indexOf(L)]?.text ?? ""),
          q.answer.toUpperCase(),
        ]);
      });
    }
  }
  return rows;
}

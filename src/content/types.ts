export type Stimulus =
  | { type: "image"; file: string; caption: string }
  | { type: "video"; file: string; caption: string }
  | { type: "audio"; file: string; caption: string };

export type Option = { id: string; text: string };

export type Question = {
  id: string; // stable id, e.g. "q01"
  prompt: string;
  options: Option[];
  /** Matching grid: one row per item to match; candidates pick one option (column) per row.
   *  Scored all-or-nothing as a single point. */
  rows?: Option[];
  /** "per-row" (grid / matching) = 1 point for each row, each row numbered as its own question.
   *  "partial" (put in order / fill in the blanks) = 1 point for each item in the right place or blank right, one number.
   *  Default: all or nothing. */
  scoring?: "per-row" | "partial";
  /** Special question types (otherwise inferred: choices, check-all, typed, date, grid):
   *  "order" = put the choices in order (answer "c,a,d,b"); "number" = typed number (answer "125.40" or "125.40 ± 0.01");
   *  "dropdown" = single choice shown as a dropdown; "match" = grid shown as one dropdown per row;
   *  "blanks" = fill in the blanks marked ___ in the question (answer: one line per blank, alternatives split by |). */
  kind?: "order" | "number" | "dropdown" | "match" | "blanks";
  /** "Check all that apply": answer is the sorted set of correct option ids ("a,d"). 1 point, exact set. */
  multi?: boolean;
  /** Points for a right answer (default 1). Not used by per-row grids, which score 1 per row. */
  points?: number;
  /** Images (etc.) shown with this question, between the question text and the choices. */
  media?: Stimulus[];
  /** Option id — or for a grid, one option id per row joined by commas ("a,b").
   *  A question with no options is a short-answer question: the candidate types the answer and
   *  `answer` holds the accepted answer(s), one per line (dates match in any common format).
   *  Server only, never sent to the browser. */
  answer: string;
};

export type Section = {
  id: string;
  title: string;
  description?: string;
  stimuli?: Stimulus[];
  /** "side-by-side": the section's images show as a row of smaller images, each with Zoom. Default: full width. */
  layout?: "side-by-side";
  questions: Question[];
};

export type AssessmentContent = {
  slug: string;
  intro: string[];
  sections: Section[];
};

export type AssessmentMeta = {
  slug: string;
  title: string;
  status: "live" | "coming-soon";
  timeLimitMinutes: number;
  passPercent: number;
  /** Candidate must have COMPLETED (any result) this assessment first. */
  prerequisite?: string;
  /** Offered on the confirmation screen after this assessment is submitted. */
  offerNext?: string;
  /** Text on the start page (paragraphs). Used when the questions come from the Questions tab. */
  intro?: string[];
};

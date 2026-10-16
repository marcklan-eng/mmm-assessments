export type Stimulus =
  | { type: "image"; file: string; caption: string }
  | { type: "video"; file: string; caption: string };

export type Option = { id: string; text: string };

export type Question = {
  id: string; // stable id, e.g. "q01"
  prompt: string;
  options: Option[];
  /** Matching grid: one row per item to match; candidates pick one option (column) per row.
   *  Scored all-or-nothing as a single point. */
  rows?: Option[];
  /** Option id — or for a grid, one option id per row joined by commas ("a,b").
   *  Server only, never sent to the browser. */
  answer: string;
};

export type Section = {
  id: string;
  title: string;
  description?: string;
  stimuli?: Stimulus[];
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

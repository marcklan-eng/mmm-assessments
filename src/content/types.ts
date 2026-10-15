export type Stimulus =
  | { type: "image"; file: string; caption: string }
  | { type: "video"; file: string; caption: string };

export type Option = { id: string; text: string };

export type Question = {
  id: string; // stable id, e.g. "q01"
  prompt: string;
  options: Option[];
  answer: string; // option id — server only, never sent to the browser
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
};

export type AttemptStatus = "in_progress" | "submitted" | "timed_out";

export type ActivityType = "tab_switch" | "fullscreen_exit" | "copy_attempt" | "screenshot_key" | "right_click";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  tab_switch: "Left the assessment window",
  fullscreen_exit: "Exited fullscreen",
  copy_attempt: "Copy / paste attempt",
  screenshot_key: "Screenshot key pressed",
  right_click: "Right-click",
};

export type Attempt = {
  id: string;
  slug: string;
  email: string;
  name: string;
  provider: string; // google | azure-ad | demo
  status: AttemptStatus;
  startedAt: number;
  deadline: number;
  submittedAt?: number;
  /** Per-candidate shuffled order (sections keep their order; questions and choices are shuffled). */
  order: { sectionId: string; questionIds: string[] }[];
  optionOrder: Record<string, string[]>;
  answers: Record<string, string>;
  activity: { type: ActivityType; at: number }[];
  // Filled in when the attempt is finalized:
  score?: number;
  total?: number;
  percent?: number;
  passed?: boolean;
  retakeAfter?: number;
  sheetSynced?: boolean;
  sheetError?: string;
};

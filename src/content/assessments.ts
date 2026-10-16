import type { AssessmentMeta } from "./types";

// Every assessment uses a 30-minute overall timer and an 80% passing score.
// To change one, edit its entry here.
const base = { timeLimitMinutes: 30, passPercent: 80 } as const;

export const ASSESSMENTS: AssessmentMeta[] = [
  { slug: "medical-biller", title: "Medical Biller", status: "live", ...base, offerNext: "advanced-rcm" },
  {
    slug: "advanced-rcm",
    title: "Advanced RCM",
    status: "coming-soon",
    ...base,
    prerequisite: "medical-biller",
    intro: [
      "This assessment is designed to understand your strengths in Medical Billing and prepare you for the task at hand that comes with the role. By profiling your skills, we aim to provide you with role/s that will best utilize your abilities within the medical billing field.",
      "Some sections contain scenario-based images, so manage your time wisely.",
      "Your responses will help us determine the roles that align with your skills. The role(s) profiled to you based on your score will be subject to further assessment during Bootcamp Training, which you must also pass.",
      "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
    ],
  },
  { slug: "medical-receptionist", title: "Medical Receptionist", status: "coming-soon", ...base },
  { slug: "dental-receptionist", title: "Dental Receptionist", status: "coming-soon", ...base },
  { slug: "medical-admin", title: "Medical Admin", status: "coming-soon", ...base },
  { slug: "dental-biller", title: "Dental Biller", status: "coming-soon", ...base },
  { slug: "health-educator", title: "Health Educator", status: "coming-soon", ...base },
  { slug: "medical-scribe", title: "Medical Scribe", status: "coming-soon", ...base },
  { slug: "general-business-va", title: "General Business VA", status: "coming-soon", ...base },
];

export function getMeta(slug: string): AssessmentMeta | undefined {
  return ASSESSMENTS.find((a) => a.slug === slug);
}

/** Lockout after any completed attempt (passed, failed or timed out). */
export const RETAKE_MONTHS = 6;

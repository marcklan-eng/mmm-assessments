import type { AssessmentMeta } from "./types";

// Every assessment uses a 30-minute overall timer and an 80% passing score.
// To change one, edit its entry here.
const base = { timeLimitMinutes: 30, passPercent: 80 } as const;

export const ASSESSMENTS: AssessmentMeta[] = [
  {
    slug: "medical-receptionist",
    title: "Medical Receptionist",
    status: "coming-soon",
    ...base,
    intro: [
      "This evaluation is designed to assess your knowledge, skills, and abilities in various areas relevant to the role of a medical receptionist. Please read each question carefully and choose the best answer from the options provided.",
      "Ensure you have a stable internet connection before starting the assessment. Please note that you have 30 minutes to complete this assessment. Some sections include audio recordings, so manage your time wisely.",
      "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
      "We appreciate your interest in the medical receptionist position and wish you the best of luck with your assessment!",
    ],
  },
  {
    slug: "medical-admin",
    title: "Medical Admin",
    status: "coming-soon",
    ...base,
    intro: [
      "This assessment is a key part of our evaluation process. It is designed to help us understand your knowledge and skills in areas crucial to providing excellent administrative support in a healthcare setting. The questions will cover topics such as patient scheduling, medical terminology, and office procedures.",
      "Ensure you have a stable internet connection before starting the assessment. Please note that you have 30 minutes to complete this assessment. Manage your time accordingly.",
      "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
      "We appreciate your interest in the medical admin position and wish you the best of luck with your assessment!",
    ],
  },
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
  {
    slug: "medical-scribe",
    title: "Medical Scribe",
    status: "coming-soon",
    ...base,
    intro: [
      "Welcome to the Medical Scribe Role Screening Task. This assessment is designed to evaluate your skills in documentation accuracy, clinical knowledge, and ability to assist healthcare providers effectively. You will be tested on areas such as medical terminology, EHR navigation, ICD-10 and CPT coding, triaging, and critical thinking.",
      "Ensure you have a stable internet connection before starting the assessment. Please note that you have 30 minutes to complete this assessment. Manage your time accordingly.",
      "If you have any questions or require assistance, please contact lead@mymountainmover.com.",
      "We appreciate your interest in the medical scribe position and wish you the best of luck with your assessment!",
    ],
  },
  { slug: "health-educator", title: "Health Educator", status: "coming-soon", ...base },
  { slug: "dental-receptionist", title: "Dental Receptionist", status: "coming-soon", ...base },
  { slug: "dental-biller", title: "Dental Biller", status: "coming-soon", ...base },
  { slug: "general-business-va", title: "General Business VA", status: "coming-soon", ...base },

];

export function getMeta(slug: string): AssessmentMeta | undefined {
  return ASSESSMENTS.find((a) => a.slug === slug);
}

/** Lockout after any completed attempt (passed, failed or timed out). */
export const RETAKE_MONTHS = 6;

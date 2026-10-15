// SERVER ONLY.
import type { AssessmentContent, Question } from "./types";
import { medicalBiller } from "./medical-biller";

const CONTENT: Record<string, AssessmentContent> = {
  [medicalBiller.slug]: medicalBiller,
};

export function getContent(slug: string): AssessmentContent | undefined {
  return CONTENT[slug];
}

export function allQuestions(content: AssessmentContent): Question[] {
  return content.sections.flatMap((s) => s.questions);
}

/** Every image/video file referenced by an assessment (used to authorize asset requests). */
export function assetFiles(content: AssessmentContent): Set<string> {
  return new Set(content.sections.flatMap((s) => (s.stimuli ?? []).map((st) => st.file)));
}

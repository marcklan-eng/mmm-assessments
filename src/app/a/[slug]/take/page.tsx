import { notFound } from "next/navigation";
import ExamClient from "@/components/ExamClient";
import { getMeta } from "@/content/assessments";

export default async function Take({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getMeta(slug)) notFound();
  return <ExamClient slug={slug} />;
}

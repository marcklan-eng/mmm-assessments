import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isEditor } from "@/lib/evaluators";
import { ASSESSMENTS } from "@/content/assessments";
import { IMAGE_TYPES, VIDEO_TYPES } from "@/lib/media";

// Issues short-lived upload tokens so the browser can upload large files straight to Blob storage.
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await currentUser();
        if (!user || !(await isEditor(user.email))) throw new Error("Only people who can edit the results Sheet can upload.");
        const slug = String(clientPayload ?? "");
        if (!ASSESSMENTS.some((a) => a.slug === slug) || !pathname.startsWith(`assessments/${slug}/`)) throw new Error("Unknown assessment.");
        return {
          allowedContentTypes: [...Object.values(IMAGE_TYPES), ...Object.values(VIDEO_TYPES)],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

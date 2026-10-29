import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB, studyMaterialBucket } from "@/lib/db";
import { Enrollment, Material } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string; materialId: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { id, materialId } = await params;
  const user = await requireUser();
  if (!user) return errorResponse("লগইন করুন।", 401);
  if (!isValidId(id) || !isValidId(materialId)) return errorResponse("ফাইলটি পাওয়া যায়নি।", 404);
  await connectDB();
  if (user.role !== "ADMIN" && !(await Enrollment.exists({ student: user.id, course: id, status: "APPROVED" }))) {
    return errorResponse("এই কোর্সের ফাইল দেখতে Admin অনুমোদন প্রয়োজন।", 403);
  }
  const material = await Material.findOne({ _id: materialId, course: id }).select("fileId fileName contentType fileSize")
    ?? await Material.findOne({ fileId: materialId, course: id }).select("fileId fileName contentType fileSize");
  if (!material?.fileId) return errorResponse("ফাইলটি পাওয়া যায়নি।", 404);
  try {
    const stream = studyMaterialBucket().openDownloadStream(material.fileId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const file = Buffer.concat(chunks);
    const filename = encodeURIComponent(material.fileName ?? "study-material.pdf").replace(/'/g, "%27");
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": material.contentType ?? "application/pdf",
        "Content-Length": String(file.length),
        "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return errorResponse("ফাইলটি পড়া যায়নি।", 404);
  }
}

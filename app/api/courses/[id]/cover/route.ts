import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB, courseCoverBucket } from "@/lib/db";
import { Course, Enrollment } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const maxImageBytes = 5_000_000;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function matchesImageType(bytes: Buffer, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  await connectDB();
  const course = await Course.findById(id).select("coverImageFileId coverImageContentType published");
  if (!course?.coverImageFileId) return errorResponse("কোর্সের ছবি পাওয়া যায়নি।", 404);
  const user = await requireUser();
  if (!course.published && user?.role !== "ADMIN" && !(user && await Enrollment.exists({ student: user.id, course: id, status: "APPROVED" }))) {
    return errorResponse("এই কোর্সের ছবি দেখার অনুমতি নেই।", 403);
  }
  try {
    const stream = courseCoverBucket().openDownloadStream(course.coverImageFileId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const image = Buffer.concat(chunks);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": course.coverImageContentType ?? "application/octet-stream",
        "Content-Length": String(image.length),
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch {
    return errorResponse("কোর্সের ছবি পড়া যায়নি।", 404);
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size === 0 || file.size > maxImageBytes) {
    return errorResponse("৫ MB-এর কম JPEG, PNG বা WebP ছবি দিন।");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesImageType(bytes, file.type)) return errorResponse("ছবির ফাইলটি বৈধ নয়।");

  await connectDB();
  const course = await Course.findById(id).select("coverImageFileId");
  if (!course) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const bucket = courseCoverBucket();
  const upload = bucket.openUploadStream(`${id}-${Date.now()}`, {
    contentType: file.type,
    metadata: { courseId: id, uploadedBy: admin.id }
  });
  await new Promise<void>((resolve, reject) => {
    upload.once("finish", resolve);
    upload.once("error", reject);
    upload.end(bytes);
  });

  const oldFileId = course.coverImageFileId;
  course.coverImageFileId = upload.id;
  course.coverImageContentType = file.type as "image/jpeg" | "image/png" | "image/webp";
  course.coverImage = `/api/courses/${id}/cover?v=${Date.now()}`;
  try {
    await course.save();
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    throw error;
  }
  if (oldFileId) await bucket.delete(oldFileId).catch(() => undefined);
  return NextResponse.json({ coverImage: course.coverImage });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  await connectDB();
  const course = await Course.findById(id).select("coverImageFileId coverImage coverImageContentType");
  if (!course) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  if (course.coverImageFileId) await courseCoverBucket().delete(course.coverImageFileId).catch(() => undefined);
  course.coverImage = "";
  course.coverImageFileId = undefined;
  course.coverImageContentType = undefined;
  await course.save();
  return NextResponse.json({ coverImage: "" });
}

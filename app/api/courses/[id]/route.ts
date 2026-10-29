import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB, courseCoverBucket, studyMaterialBucket } from "@/lib/db";
import { Attempt, Course, Enrollment, Exam, Material, Result } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  const update: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body?.description === "string") update.description = body.description.trim();
  if (typeof body?.paymentInstructions === "string") update.paymentInstructions = body.paymentInstructions.trim();
  if (body?.fee !== undefined && Number.isFinite(Number(body.fee)) && Number(body.fee) >= 0) update.fee = Number(body.fee);
  if (typeof body?.published === "boolean") update.published = body.published;
  if (!Object.keys(update).length) return errorResponse("পরিবর্তনের তথ্য দিন।");
  await connectDB();
  const course = await Course.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!course) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  return NextResponse.json({ course });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  await connectDB();
  const course = await Course.findById(id).select("coverImageFileId");
  if (!course) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);

  const materials = await Material.find({ course: id }).select("fileId").lean();
  const materialBucket = studyMaterialBucket();
  await Promise.all(materials.filter((material) => material.fileId).map((material) => materialBucket.delete(material.fileId!).catch(() => undefined)));
  const exams = await Exam.find({ course: id }).select("_id").lean();
  const examIds = exams.map((exam) => exam._id);
  if (examIds.length) {
    await Result.deleteMany({ exam: { $in: examIds } });
    await Attempt.deleteMany({ exam: { $in: examIds } });
  }
  await Promise.all([
    Enrollment.deleteMany({ course: id }),
    Material.deleteMany({ course: id }),
    Exam.deleteMany({ course: id })
  ]);
  await course.deleteOne();
  if (course.coverImageFileId) await courseCoverBucket().delete(course.coverImageFileId).catch(() => undefined);
  return NextResponse.json({ deleted: true });
}

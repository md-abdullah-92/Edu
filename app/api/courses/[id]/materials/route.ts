import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB, studyMaterialBucket } from "@/lib/db";
import { Course, Enrollment, Material } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return errorResponse("লগইন করুন।", 401);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  await connectDB();
  if (user.role !== "ADMIN" && !(await Enrollment.exists({ student: user.id, course: id, status: "APPROVED" }))) {
    return errorResponse("এই কোর্সের কনটেন্ট দেখতে Admin অনুমোদন প্রয়োজন।", 403);
  }
  const materials = await Material.find({ course: id }).select("-createdBy -fileId -storagePath").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ materials });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const title = typeof form?.get("title") === "string" ? String(form.get("title")).trim() : "";
    const description = typeof form?.get("description") === "string" ? String(form.get("description")).trim() : "";
    const file = form?.get("file");
    if (!title || !(file instanceof File) || file.type !== "application/pdf" || file.size === 0 || file.size > 20_000_000) {
      return errorResponse("শিরোনাম ও ২০ MB-এর কম একটি বৈধ PDF ফাইল দিন।");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.toString("ascii", 0, 5) !== "%PDF-") return errorResponse("PDF ফাইলটি বৈধ নয়।");
    await connectDB();
    if (!(await Course.exists({ _id: id }))) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
    const bucket = studyMaterialBucket();
    const upload = bucket.openUploadStream(file.name.slice(0, 255), {
      contentType: "application/pdf",
      metadata: { courseId: id, uploadedBy: admin.id }
    });
    await new Promise<void>((resolve, reject) => {
      upload.once("finish", resolve);
      upload.once("error", reject);
      upload.end(bytes);
    });
    try {
      const material = new Material({
        course: id,
        title,
        description,
        kind: "PDF",
        fileId: upload.id,
        fileName: file.name.slice(0, 255),
        contentType: "application/pdf",
        fileSize: file.size,
        url: "",
        createdBy: admin.id
      });
      material.url = `/api/courses/${id}/materials/${material.id}/file`;
      await material.save();
      return NextResponse.json({ material }, { status: 201 });
    } catch (error) {
      await bucket.delete(upload.id).catch(() => undefined);
      throw error;
    }
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const kind = body?.kind;
  if (!title || !/^https?:\/\/\S+$/i.test(url) || !["PDF", "NOTE", "LINK"].includes(kind)) {
    return errorResponse("শিরোনাম, বৈধ http(s) URL এবং উপকরণের ধরন দিন।");
  }
  await connectDB();
  if (!(await Course.exists({ _id: id }))) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const material = await Material.create({ course: id, title, url, description, kind, createdBy: admin.id });
  return NextResponse.json({ material }, { status: 201 });
}

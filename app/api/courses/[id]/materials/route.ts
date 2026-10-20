import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
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
  const materials = await Material.find({ course: id }).select("-createdBy").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ materials });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
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

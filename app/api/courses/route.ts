import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Course } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function GET() {
  await connectDB();
  const user = await requireUser();
  const filter = user?.role === "ADMIN" ? {} : { published: true };
  const courses = await Course.find(filter).select("title description coverImage fee paymentInstructions published").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ courses });
}

export async function POST(request: NextRequest) {
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const paymentInstructions = typeof body?.paymentInstructions === "string" ? body.paymentInstructions.trim() : "";
  const fee = Number(body?.fee);
  if (!title || !description || !paymentInstructions || !Number.isFinite(fee) || fee < 0) {
    return errorResponse("কোর্সের নাম, বিবরণ, পেমেন্ট নির্দেশনা ও বৈধ ফি দিন।");
  }
  await connectDB();
  const course = await Course.create({ title, description, fee, paymentInstructions, published: body?.published === true, createdBy: admin.id });
  return NextResponse.json({ course }, { status: 201 });
}

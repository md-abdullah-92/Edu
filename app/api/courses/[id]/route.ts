import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Course } from "@/lib/models";
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

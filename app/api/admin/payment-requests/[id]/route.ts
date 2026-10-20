import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Enrollment } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("রিকোয়েস্টটি পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  if (!["APPROVED", "REJECTED"].includes(body?.status)) return errorResponse("সিদ্ধান্ত APPROVED অথবা REJECTED হতে হবে।");
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";
  if (body.status === "REJECTED" && !rejectionReason) return errorResponse("প্রত্যাখ্যানের কারণ লিখুন।");
  await connectDB();
  const enrollment = await Enrollment.findOneAndUpdate(
    { _id: id, status: "PENDING" },
    { status: body.status, rejectionReason: body.status === "REJECTED" ? rejectionReason : undefined, reviewedBy: admin.id, reviewedAt: new Date() },
    { new: true, runValidators: true }
  );
  if (!enrollment) return errorResponse("রিকোয়েস্টটি পাওয়া যায়নি বা ইতিমধ্যে সিদ্ধান্ত নেওয়া হয়েছে।", 409);
  return NextResponse.json({ enrollment });
}

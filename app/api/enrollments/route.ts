import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Course, Enrollment } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

export async function GET() {
  const student = await requireUser("STUDENT");
  if (!student) return errorResponse("শিক্ষার্থী হিসেবে লগইন করুন।", 401);
  await connectDB();
  const enrollments = await Enrollment.find({ student: student.id }).populate("course", "title fee").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ enrollments });
}

export async function POST(request: NextRequest) {
  const student = await requireUser("STUDENT");
  if (!student) return errorResponse("শিক্ষার্থী হিসেবে লগইন করুন।", 401);
  const body = await request.json().catch(() => null);
  const courseId = typeof body?.courseId === "string" ? body.courseId : "";
  const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim().toUpperCase() : "";
  const senderMobile = typeof body?.senderMobile === "string" ? body.senderMobile.trim() : "";
  const paymentMethod = body?.paymentMethod;
  if (!isValidId(courseId) || !/^[A-Z0-9-]{5,40}$/.test(transactionId) || !/^[+\d][\d\s-]{7,19}$/.test(senderMobile) || !["BKASH", "NAGAD"].includes(paymentMethod)) {
    return errorResponse("কোর্স, পেমেন্ট মাধ্যম, বৈধ Transaction ID ও প্রেরকের মোবাইল দিন।");
  }
  await connectDB();
  if (!(await Course.exists({ _id: courseId, published: true }))) return errorResponse("প্রকাশিত কোর্সটি পাওয়া যায়নি।", 404);
  const existing = await Enrollment.findOne({ student: student.id, course: courseId });
  if (existing && existing.status !== "REJECTED") {
    return errorResponse(existing.status === "APPROVED" ? "এই কোর্সে আপনার এনরোলমেন্ট ইতিমধ্যে অনুমোদিত।" : "এই কোর্সের পেমেন্ট রিকোয়েস্ট যাচাইাধীন।", 409);
  }
  try {
    const enrollment = existing
      ? await Enrollment.findByIdAndUpdate(existing.id, {
        paymentMethod, transactionId, senderMobile, status: "PENDING", rejectionReason: undefined, reviewedBy: undefined, reviewedAt: undefined
      }, { new: true, runValidators: true })
      : await Enrollment.create({ student: student.id, course: courseId, paymentMethod, transactionId, senderMobile });
    return NextResponse.json({ enrollment, message: "রিকোয়েস্ট জমা হয়েছে। Admin অনুমোদনের আগে কোর্সের কনটেন্ট ব্যবহার করা যাবে না।" }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return errorResponse("এই Transaction ID অন্য একটি পেমেন্ট রিকোয়েস্টে ব্যবহৃত হয়েছে।", 409);
    }
    throw error;
  }
}

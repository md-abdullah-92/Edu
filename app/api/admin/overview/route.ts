import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Course, Enrollment, Exam, Result, User } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function GET() {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই তথ্য দেখতে পারবেন।", 403);
  await connectDB();
  const [students, pendingPayments, courses, exams, recentPayments] = await Promise.all([
    User.countDocuments({ role: "STUDENT" }),
    Enrollment.countDocuments({ status: "PENDING" }),
    Course.countDocuments(),
    Exam.countDocuments(),
    Enrollment.find().populate("student", "name email mobile").populate("course", "title").sort({ createdAt: -1 }).limit(8).lean()
  ]);
  return NextResponse.json({ stats: { students, pendingPayments, courses, exams }, recentPayments });
}

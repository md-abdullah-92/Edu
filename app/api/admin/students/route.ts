import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Enrollment, Result, User } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function GET() {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই তথ্য দেখতে পারবেন।", 403);
  await connectDB();
  const students = await User.find({ role: "STUDENT" }).select("name email mobile active createdAt").sort({ createdAt: -1 }).lean();
  const data = await Promise.all(students.map(async (student) => ({
    ...student,
    enrollments: await Enrollment.countDocuments({ student: student._id }),
    results: await Result.countDocuments({ student: student._id })
  })));
  return NextResponse.json({ students: data });
}

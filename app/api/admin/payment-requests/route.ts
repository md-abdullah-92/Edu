import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Enrollment } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function GET() {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই তথ্য দেখতে পারবেন।", 403);
  await connectDB();
  const requests = await Enrollment.find().populate("student", "name email mobile").populate("course", "title fee").sort({ createdAt: -1 }).lean();
  return NextResponse.json({ requests });
}

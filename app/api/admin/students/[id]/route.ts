import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  const { id } = await params;
  if (!isValidId(id)) return errorResponse("শিক্ষার্থীকে পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  if (typeof body?.active !== "boolean") return errorResponse("অ্যাকাউন্টের active অবস্থা দিন।");
  await connectDB();
  const student = await User.findOneAndUpdate(
    { _id: id, role: "STUDENT" },
    { active: body.active },
    { new: true, runValidators: true }
  ).select("name mobile active");
  if (!student) return errorResponse("শিক্ষার্থীকে পাওয়া যায়নি।", 404);
  return NextResponse.json({ student });
}

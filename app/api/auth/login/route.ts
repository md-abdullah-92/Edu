import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { User } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return errorResponse("সঠিক ইমেইল ও পাসওয়ার্ড দিন।");
  try {
    await connectDB();
  } catch {
    return errorResponse("MongoDB-তে সংযোগ করা যায়নি। MONGODB_URI যাচাই করে server restart করুন।", 503);
  }
  const user = await User.findOne({ email, emailVerified: { $ne: false } }).select("+passwordHash name role active");
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return errorResponse("লগইন তথ্য সঠিক নয়।", 401);
  }
  await createSession({ id: user.id, name: user.name, role: user.role });
  return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
}

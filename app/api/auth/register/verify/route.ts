import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { EmailOtp, User } from "@/lib/models";
import { errorResponse } from "@/lib/http";
import { isValidOtp } from "@/lib/registration-otp";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return errorResponse("সঠিক ইমেইল এবং ৬ সংখ্যার OTP দিন।");
  }
  try {
    await connectDB();
  } catch {
    return errorResponse("MongoDB-তে সংযোগ করা যায়নি। MONGODB_URI যাচাই করে server restart করুন।", 503);
  }
  const pending = await EmailOtp.findOne({ email }).select("+passwordHash +codeHash");
  if (!pending || pending.expiresAt <= new Date() || pending.attempts >= 5) {
    return errorResponse("OTP মেয়াদোত্তীর্ণ বা অনুপলব্ধ। নতুন OTP নিন।", 400);
  }
  if (!isValidOtp(email, code, pending.codeHash)) {
    await EmailOtp.updateOne({ _id: pending.id, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } });
    return errorResponse("OTP সঠিক নয়।", 400);
  }

  try {
    const user = await User.create({
      name: pending.name,
      email,
      passwordHash: pending.passwordHash,
      emailVerified: true,
      role: "STUDENT"
    });
    await EmailOtp.deleteOne({ _id: pending.id });
    await createSession({ id: user.id, name: user.name, role: user.role });
    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      await EmailOtp.deleteOne({ _id: pending.id });
      return errorResponse("এই ইমেইলে ইতিমধ্যে অ্যাকাউন্ট আছে।", 409);
    }
    throw error;
  }
}

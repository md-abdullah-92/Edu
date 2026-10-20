import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EmailOtp, User } from "@/lib/models";
import { errorResponse } from "@/lib/http";
import { sendOtpForPendingRegistration } from "@/lib/registration-otp";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || password.length < 8) {
    return errorResponse("নাম, সঠিক ইমেইল এবং অন্তত ৮ অক্ষরের পাসওয়ার্ড দিন।");
  }

  try {
    await connectDB();
  } catch {
    return errorResponse("MongoDB-তে সংযোগ করা যায়নি। MONGODB_URI যাচাই করে server restart করুন।", 503);
  }
  if (await User.exists({ email })) return errorResponse("এই ইমেইলে ইতিমধ্যে অ্যাকাউন্ট আছে।", 409);
  const existingOtp = await EmailOtp.findOne({ email }).select("+passwordHash");
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await sendOtpForPendingRegistration(
    { email, name, passwordHash },
    existingOtp ?? undefined
  );
  if (result.error) return errorResponse(result.error, result.status);
  return NextResponse.json({ message: `যাচাই কোড ${email}-এ পাঠানো হয়েছে।`, email });
}

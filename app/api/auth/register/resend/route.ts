import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { EmailOtp } from "@/lib/models";
import { errorResponse } from "@/lib/http";
import { sendOtpForPendingRegistration } from "@/lib/registration-otp";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return errorResponse("সঠিক ইমেইল দিন।");
  }
  try {
    await connectDB();
  } catch {
    return errorResponse("MongoDB-তে সংযোগ করা যায়নি। MONGODB_URI যাচাই করে server restart করুন।", 503);
  }
  const pending = await EmailOtp.findOne({ email }).select("+passwordHash");
  if (!pending) return errorResponse("নিবন্ধনের অনুরোধ পাওয়া যায়নি। আবার নিবন্ধন শুরু করুন।", 404);
  const result = await sendOtpForPendingRegistration(
    { email, name: pending.name, passwordHash: pending.passwordHash },
    pending
  );
  if (result.error) return errorResponse(result.error, result.status);
  return NextResponse.json({ message: `নতুন যাচাই কোড ${email}-এ পাঠানো হয়েছে।`, email });
}

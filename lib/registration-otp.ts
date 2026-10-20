import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { EmailOtp } from "@/lib/models";
import { sendRegistrationOtp } from "@/lib/email";

const OTP_LIFETIME_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const RESEND_WINDOW_MS = 60 * 60_000;
const MAX_SENDS_PER_WINDOW = 5;

function hashOtp(email: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function isValidOtp(email: string, code: string, storedHash: string) {
  const expected = Buffer.from(hashOtp(email, code), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function sendOtpForPendingRegistration(
  registration: { email: string; name: string; passwordHash: string },
  existingOtp?: {
    _id: unknown;
    lastSentAt: Date;
    windowStartedAt: Date;
    sentCount: number;
  }
) {
  const now = new Date();
  let windowStartedAt = existingOtp?.windowStartedAt ?? now;
  let sentCount = existingOtp?.sentCount ?? 0;

  if (existingOtp && now.getTime() - existingOtp.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { error: "নতুন OTP পাঠানোর আগে এক মিনিট অপেক্ষা করুন।", status: 429 };
  }
  if (now.getTime() - windowStartedAt.getTime() >= RESEND_WINDOW_MS) {
    windowStartedAt = now;
    sentCount = 0;
  }
  if (sentCount >= MAX_SENDS_PER_WINDOW) {
    return { error: "এই ইমেইলে OTP পাঠানোর সীমা পূর্ণ হয়েছে। এক ঘণ্টা পরে আবার চেষ্টা করুন।", status: 429 };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const update = {
    ...registration,
    codeHash: hashOtp(registration.email, code),
    expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
    lastSentAt: now,
    windowStartedAt,
    sentCount: sentCount + 1,
    attempts: 0
  };
  if (existingOtp) await EmailOtp.findByIdAndUpdate(existingOtp._id, update, { runValidators: true });
  else await EmailOtp.create(update);

  try {
    await sendRegistrationOtp(registration.email, code);
  } catch (error) {
    await EmailOtp.deleteOne({ email: registration.email, codeHash: update.codeHash });
    console.error("Email OTP delivery failed:", error);
    return { error: "ইমেইল পাঠানো যায়নি। Gmail SMTP সেটিংস যাচাই করে আবার চেষ্টা করুন।", status: 503 };
  }
  return { error: null, status: 200 };
}

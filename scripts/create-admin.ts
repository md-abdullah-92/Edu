import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db";
import { User } from "../lib/models";

async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters).");
  }
  await connectDB();
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) {
    throw new Error("An account already exists with that admin email.");
  }
  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    emailVerified: true,
    role: "ADMIN"
  });
  console.log(`Admin account created: ${email}`);
  await (await import("mongoose")).default.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

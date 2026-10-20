import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";

export type Role = "ADMIN" | "STUDENT";
export type AuthUser = { id: string; name: string; role: Role };
const cookieName = "eduprepx_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}

export async function createSession(user: AuthUser) {
  const token = await new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function getSession(): Promise<AuthUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || (payload.role !== "ADMIN" && payload.role !== "STUDENT")) return null;
    return { id: payload.sub, name: String(payload.name ?? ""), role: payload.role };
  } catch {
    return null;
  }
}

export async function requireUser(role?: Role) {
  const user = await getSession();
  if (!user || (role && user.role !== role)) return null;
  await connectDB();
  const current = await User.exists({ _id: user.id, active: true });
  return current ? user : null;
}

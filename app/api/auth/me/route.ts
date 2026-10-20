import { NextResponse } from "next/server";
import { getSession, requireUser } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user || !(await requireUser())) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}

import { NextResponse } from "next/server";

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function isValidId(id: string) {
  return /^[a-f\d]{24}$/i.test(id);
}

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Attempt, Enrollment, Exam, Result } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const student = await requireUser("STUDENT");
  if (!student) return errorResponse("শিক্ষার্থী হিসেবে লগইন করুন।", 401);
  if (!isValidId(id)) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.answers)) return errorResponse("উত্তরের তালিকা দিন।");
  await connectDB();
  const exam = await Exam.findById(id);
  if (!exam) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  if (!(await Enrollment.exists({ student: student.id, course: exam.course, status: "APPROVED" }))) {
    return errorResponse("পরীক্ষা জমা দিতে Admin অনুমোদন প্রয়োজন।", 403);
  }
  const attempt = await Attempt.findOne({ exam: exam.id, student: student.id });
  const now = new Date();
  if (!attempt || attempt.submittedAt || attempt.expiresAt < now || exam.endsAt < now) {
    return errorResponse("পরীক্ষার প্রচেষ্টা নেই, জমা হয়েছে অথবা সময় শেষ।", 409);
  }
  if (body.answers.length !== exam.questions.length ||
      body.answers.some((answer: unknown) => !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) > 3)) {
    return errorResponse("প্রতিটি প্রশ্নের জন্য একটি বৈধ অপশন নির্বাচন করুন।");
  }
  const totalMarks = exam.questions.reduce((sum: number, question: { marks: number }) => sum + question.marks, 0);
  let score = 0;
  let correctCount = 0;
  exam.questions.forEach((question: { correctIndex: number; marks: number }, index: number) => {
    if (body.answers[index] === question.correctIndex) {
      score += question.marks;
      correctCount += 1;
    }
  });
  try {
    const result = await Result.create({
      exam: exam.id, student: student.id, answers: body.answers, score, totalMarks, correctCount, submittedAt: now
    });
    attempt.submittedAt = now;
    await attempt.save();
    return NextResponse.json({ result: { score, totalMarks, correctCount, questionCount: exam.questions.length, passed: score >= exam.passMark } }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return errorResponse("এই পরীক্ষা ইতিমধ্যে জমা দিয়েছেন।", 409);
    }
    throw error;
  }
}

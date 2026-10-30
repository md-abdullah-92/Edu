import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Attempt, Enrollment, Exam, Result } from "@/lib/models";
import { calculateExamScore, rankExamResults } from "@/lib/exam-results";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const student = await requireUser("STUDENT");
  if (!student) return errorResponse("শিক্ষার্থী হিসেবে লগইন করুন।", 401);
  if (!isValidId(id)) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.answers) || !isValidId(body?.attemptId)) return errorResponse("পরীক্ষার প্রচেষ্টা ও উত্তরের তালিকা দিন।");
  await connectDB();
  const exam = await Exam.findById(id);
  if (!exam) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  if (!(await Enrollment.exists({ student: student.id, course: exam.course, status: "APPROVED" }))) {
    return errorResponse("পরীক্ষা জমা দিতে Admin অনুমোদন প্রয়োজন।", 403);
  }
  const attempt = await Attempt.findOne({ _id: body.attemptId, exam: exam.id, student: student.id });
  const now = new Date();
  if (!attempt || attempt.submittedAt || now.getTime() - attempt.expiresAt.getTime() > 10_000 || exam.endsAt.getTime() < now.getTime() - 10_000) {
    return errorResponse("পরীক্ষার প্রচেষ্টা নেই, জমা হয়েছে অথবা সময় শেষ।", 409);
  }
  if (body.answers.length !== exam.questions.length ||
      body.answers.some((answer: unknown) => !Number.isInteger(answer) || Number(answer) < -1 || Number(answer) > 3)) {
    return errorResponse("প্রতিটি প্রশ্নের জন্য বৈধ উত্তর নির্বাচন করুন অথবা ফাঁকা রাখুন।");
  }
  const scoreSummary = calculateExamScore(
    exam.questions,
    body.answers,
    exam.negativeMarkingEnabled,
    exam.negativeMarks
  );
  const { score, totalMarks, correctCount, wrongCount, unansweredCount } = scoreSummary;
  try {
    const result = await Result.create({
      exam: exam.id, student: student.id, attemptNumber: attempt.attemptNumber,
      answers: body.answers, score, totalMarks, correctCount, wrongCount, unansweredCount, submittedAt: now
    });
    attempt.submittedAt = now;
    await attempt.save();
    const submittedResults = await Result.find({ exam: exam.id }).select("student score submittedAt").sort({ submittedAt: 1 }).lean();
    const rankedStudents = rankExamResults(
      submittedResults,
      exam.leaderboardRule,
      (result) => String(result.student),
      (result) => result.score,
      (result) => result.submittedAt
    );
    const ownRank = rankedStudents.find((entry) => entry.studentId === student.id);
    return NextResponse.json({ result: { attemptNumber: attempt.attemptNumber, ...scoreSummary, questionCount: exam.questions.length, passed: score >= exam.passMark, rank: ownRank?.rank ?? rankedStudents.length, rankTotal: rankedStudents.length } }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return errorResponse("এই প্রচেষ্টাটি ইতিমধ্যে জমা হয়েছে।", 409);
    }
    throw error;
  }
}

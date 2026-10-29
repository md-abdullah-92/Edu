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
  const totalMarks = exam.questions.reduce((sum: number, question: { marks: number }) => sum + question.marks, 0);
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  exam.questions.forEach((question: { correctIndex: number; marks: number }, index: number) => {
    if (body.answers[index] === question.correctIndex) {
      score += question.marks;
      correctCount += 1;
    } else if (body.answers[index] < 0) {
      unansweredCount += 1;
    } else {
      wrongCount += 1;
      if (exam.negativeMarkingEnabled) score -= exam.negativeMarks;
    }
  });
  score = Math.max(0, Number(score.toFixed(2)));
  try {
    const result = await Result.create({
      exam: exam.id, student: student.id, attemptNumber: attempt.attemptNumber,
      answers: body.answers, score, totalMarks, correctCount, wrongCount, unansweredCount, submittedAt: now
    });
    attempt.submittedAt = now;
    await attempt.save();
    const submittedResults = await Result.find({ exam: exam.id }).select("student score submittedAt").sort({ submittedAt: 1 }).lean();
    const rankedByStudent = new Map<string, typeof submittedResults[number]>();
    for (const submittedResult of submittedResults) {
      const studentId = String(submittedResult.student);
      const previous = rankedByStudent.get(studentId);
      const useResult = !previous || (exam.leaderboardRule === "FIRST"
        ? submittedResult.submittedAt < previous.submittedAt
        : exam.leaderboardRule === "LATEST"
          ? submittedResult.submittedAt > previous.submittedAt
          : submittedResult.score > previous.score || (submittedResult.score === previous.score && submittedResult.submittedAt < previous.submittedAt));
      if (useResult) rankedByStudent.set(studentId, submittedResult);
    }
    const rankedStudents = [...rankedByStudent.entries()].sort(([, left], [, right]) =>
      right.score - left.score || left.submittedAt.valueOf() - right.submittedAt.valueOf()
    );
    const rank = rankedStudents.findIndex(([studentId]) => studentId === student.id) + 1;
    return NextResponse.json({ result: { attemptNumber: attempt.attemptNumber, score, totalMarks, correctCount, wrongCount, unansweredCount, questionCount: exam.questions.length, passed: score >= exam.passMark, rank, rankTotal: rankedStudents.length } }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return errorResponse("এই প্রচেষ্টাটি ইতিমধ্যে জমা হয়েছে।", 409);
    }
    throw error;
  }
}

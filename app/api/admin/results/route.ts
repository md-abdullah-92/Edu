import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Exam, Result } from "@/lib/models";
import { errorResponse } from "@/lib/http";

export async function GET() {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই তথ্য দেখতে পারবেন।", 403);
  await connectDB();
  const results = await Result.find().select("+answers").populate("student", "name email mobile").populate({
    path: "exam",
    select: "title passMark questions",
    populate: { path: "course", select: "title" }
  }).sort({ submittedAt: -1 }).lean();
  const detailed = results.map((result) => {
    const exam = result.exam as unknown as {
      title: string; passMark: number; questions: Array<{ prompt: string; options: string[]; correctIndex: number }>
    };
    const answers = result.answers as number[];
    return {
      id: String(result._id),
      student: result.student,
      exam: { title: exam.title },
      score: result.score,
      totalMarks: result.totalMarks,
      submittedAt: result.submittedAt,
      passed: result.score >= exam.passMark,
      details: exam.questions.map((question, index) => ({
        prompt: question.prompt,
        chosen: question.options[answers[index]] ?? "উত্তর দেননি",
        correct: question.options[question.correctIndex],
        isCorrect: answers[index] === question.correctIndex
      }))
    };
  });
  return NextResponse.json({ results: detailed });
}

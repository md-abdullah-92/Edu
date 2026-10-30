import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Result } from "@/lib/models";
import { calculateExamScore, rankExamResults } from "@/lib/exam-results";
import { errorResponse } from "@/lib/http";

export async function GET() {
  if (!(await requireUser("ADMIN"))) return errorResponse("শুধু Admin এই তথ্য দেখতে পারবেন।", 403);
  await connectDB();
  const results = await Result.find().select("+answers attemptNumber wrongCount unansweredCount").populate("student", "name email mobile").populate({
    path: "exam",
    select: "title passMark questions negativeMarkingEnabled negativeMarks leaderboardRule",
    populate: { path: "course", select: "title" }
  }).sort({ submittedAt: -1 }).lean();
  const scoreSummaries = new Map<string, ReturnType<typeof calculateExamScore>>();
  for (const result of results) {
    const exam = result.exam as unknown as {
      negativeMarkingEnabled: boolean; negativeMarks: number;
      questions: Array<{ correctIndex: number; marks: number }>
    };
    const scoreSummary = calculateExamScore(exam.questions, result.answers as number[], exam.negativeMarkingEnabled, exam.negativeMarks);
    scoreSummaries.set(String(result._id), scoreSummary);
  }
  const getScoreSummary = (resultId: string) => {
    const scoreSummary = scoreSummaries.get(resultId);
    if (!scoreSummary) throw new Error(`Missing calculated exam score for result ${resultId}`);
    return scoreSummary;
  };
  const ranksByResultId = new Map<string, { rank: number; rankTotal: number }>();
  const resultsByExam = new Map<string, typeof results>();
  for (const result of results) {
    const examId = String(result.exam._id);
    const examResults = resultsByExam.get(examId) ?? [];
    examResults.push(result);
    resultsByExam.set(examId, examResults);
  }
  for (const examResults of resultsByExam.values()) {
    const exam = examResults[0].exam as unknown as { leaderboardRule: "FIRST" | "HIGHEST" | "LATEST" };
    const ranked = rankExamResults(
      examResults,
      exam.leaderboardRule,
      (result) => String(result.student._id),
      (result) => getScoreSummary(String(result._id)).score,
      (result) => result.submittedAt
    );
    const rankByStudent = new Map(ranked.map(({ studentId, rank, rankTotal }) => [studentId, { rank, rankTotal }]));
    for (const result of examResults) {
      const studentRank = rankByStudent.get(String(result.student._id));
      if (studentRank) ranksByResultId.set(String(result._id), studentRank);
    }
  }
  const detailed = results.map((result) => {
    const exam = result.exam as unknown as {
      title: string; passMark: number; negativeMarkingEnabled: boolean; negativeMarks: number;
      questions: Array<{ prompt: string; options: string[]; correctIndex: number; marks: number; explanation?: string }>
    };
    const answers = result.answers as number[];
    const scoreSummary = getScoreSummary(String(result._id));
    return {
      id: String(result._id),
      student: result.student,
      exam: { title: exam.title },
      score: scoreSummary.score,
      totalMarks: scoreSummary.totalMarks,
      correctMarks: scoreSummary.correctMarks,
      negativeMarksDeducted: scoreSummary.negativeMarksDeducted,
      scoreFloorApplied: scoreSummary.scoreFloorApplied,
      rank: ranksByResultId.get(String(result._id))?.rank ?? 0,
      rankTotal: ranksByResultId.get(String(result._id))?.rankTotal ?? 0,
      attemptNumber: result.attemptNumber ?? 1,
      correctCount: scoreSummary.correctCount,
      wrongCount: scoreSummary.wrongCount,
      unansweredCount: scoreSummary.unansweredCount,
      submittedAt: result.submittedAt,
      passed: scoreSummary.score >= exam.passMark,
      details: exam.questions.map((question, index) => ({
        prompt: question.prompt,
        chosen: question.options[answers[index]] ?? "উত্তর দেননি",
        correct: question.options[question.correctIndex],
        isCorrect: answers[index] === question.correctIndex,
        marks: question.marks,
        earnedMarks: answers[index] === question.correctIndex ? question.marks : answers[index] < 0 ? 0 : exam.negativeMarkingEnabled ? -exam.negativeMarks : 0,
        explanation: question.explanation ?? ""
      }))
    };
  });
  return NextResponse.json({ results: detailed });
}

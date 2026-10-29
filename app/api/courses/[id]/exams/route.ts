import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Course, Enrollment, Exam, Result } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) return errorResponse("লগইন করুন।", 401);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  await connectDB();
  if (user.role !== "ADMIN" && !(await Enrollment.exists({ student: user.id, course: id, status: "APPROVED" }))) {
    return errorResponse("এই কোর্সের পরীক্ষা দিতে Admin অনুমোদন প্রয়োজন।", 403);
  }
  const exams = await Exam.find({ course: id }).select("title durationMinutes startsAt endsAt passMark negativeMarkingEnabled negativeMarks leaderboardRule questions.prompt questions.options questions.marks questions.correctIndex questions.explanation").lean();
  const results = await Result.find({ exam: { $in: exams.map((exam) => exam._id) } })
    .select("+answers exam student attemptNumber score totalMarks correctCount wrongCount unansweredCount submittedAt")
    .populate("student", "name")
    .sort({ submittedAt: 1 })
    .lean();
  return NextResponse.json({
    exams: exams.map(({ _id, questions, ...exam }) => {
      const examResults = results.filter((result) => String(result.exam) === String(_id));
      const ownResults = examResults.filter((result) => String(result.student._id) === user.id);
      const rankedByStudent = new Map<string, typeof examResults[number]>();
      for (const result of examResults) {
        const studentId = String(result.student._id);
        const current = rankedByStudent.get(studentId);
        const useResult = !current || (exam.leaderboardRule === "FIRST"
          ? result.submittedAt < current.submittedAt
          : exam.leaderboardRule === "LATEST"
            ? result.submittedAt > current.submittedAt
            : result.score > current.score || (result.score === current.score && result.submittedAt < current.submittedAt));
        if (useResult) rankedByStudent.set(studentId, result);
      }
      const rankedStudents = [...rankedByStudent.entries()]
        .sort(([, left], [, right]) => right.score - left.score || left.submittedAt.valueOf() - right.submittedAt.valueOf());
      const ownRank = rankedStudents.findIndex(([studentId]) => studentId === user.id) + 1;
      const leaderboard = rankedStudents
        .slice(0, 20)
        .map(([studentId, result], index) => ({ rank: index + 1, name: (result.student as unknown as { name: string }).name, score: result.score, totalMarks: result.totalMarks, isCurrentStudent: studentId === user.id }));
      return {
        ...exam,
        id: String(_id),
        questionCount: questions.length,
        results: ownResults.map((result) => ({
          attemptNumber: result.attemptNumber ?? 1,
          score: result.score,
          totalMarks: result.totalMarks,
          correctCount: result.correctCount,
          wrongCount: result.wrongCount ?? 0,
          unansweredCount: result.unansweredCount ?? 0,
          submittedAt: result.submittedAt,
          rank: ownRank,
          rankTotal: rankedStudents.length,
          passed: result.score >= exam.passMark,
          details: questions.map((question: { prompt: string; options: string[]; correctIndex: number; marks: number; explanation?: string }, index: number) => ({
            prompt: question.prompt,
            options: question.options,
            chosenIndex: result.answers[index] >= 0 ? result.answers[index] : null,
            correctIndex: question.correctIndex,
            isCorrect: result.answers[index] === question.correctIndex,
            marks: question.marks,
            earnedMarks: result.answers[index] === question.correctIndex ? question.marks : result.answers[index] < 0 ? 0 : exam.negativeMarkingEnabled ? -exam.negativeMarks : 0,
            explanation: question.explanation ?? ""
          }))
        })),
        leaderboard
      };
    })
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const admin = await requireUser("ADMIN");
  if (!admin) return errorResponse("শুধু Admin এই কাজ করতে পারবেন।", 403);
  if (!isValidId(id)) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const durationMinutes = Number(body?.durationMinutes);
  const passMark = Number(body?.passMark);
  const negativeMarkingEnabled = body?.negativeMarkingEnabled === true;
  const negativeMarks = Number(body?.negativeMarks ?? 0.25);
  const leaderboardRule = ["FIRST", "HIGHEST", "LATEST"].includes(body?.leaderboardRule) ? body.leaderboardRule : "HIGHEST";
  const startsAt = new Date(body?.startsAt);
  const endsAt = new Date(body?.endsAt);
  if (!title || !Array.isArray(body?.questions) || !body.questions.length ||
      !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360 ||
      !Number.isFinite(passMark) || passMark < 0 || !Number.isFinite(negativeMarks) || negativeMarks < 0 ||
      Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || startsAt >= endsAt) {
    return errorResponse("পরীক্ষার নাম, প্রশ্ন, বৈধ সময়সীমা, pass mark এবং শুরু/শেষের সময় দিন।");
  }
  const questions = [];
  for (const question of body.questions) {
    if (typeof question?.prompt !== "string" || !question.prompt.trim() || !Array.isArray(question.options) ||
        question.options.length !== 4 || question.options.some((option: unknown) => typeof option !== "string" || !option.trim()) ||
        !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3 ||
        !Number.isFinite(Number(question.marks)) || Number(question.marks) <= 0 ||
        (question.explanation !== undefined && (typeof question.explanation !== "string" || question.explanation.length > 2000))) {
      return errorResponse("প্রতিটি প্রশ্নে চারটি অপশন, সঠিক উত্তর এবং শূন্যের বেশি নম্বর দিতে হবে।");
    }
    questions.push({
      prompt: question.prompt.trim(),
      options: question.options.map((option: string) => option.trim()),
      correctIndex: question.correctIndex,
      marks: Number(question.marks),
      explanation: typeof question.explanation === "string" ? question.explanation.trim() : ""
    });
  }
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  if (passMark > totalMarks) return errorResponse("Pass mark মোট নম্বরের বেশি হতে পারবে না।");
  await connectDB();
  if (!(await Course.exists({ _id: id }))) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const exam = await Exam.create({ course: id, title, durationMinutes, startsAt, endsAt, passMark, negativeMarkingEnabled, negativeMarks, leaderboardRule, questions, createdBy: admin.id });
  return NextResponse.json({ exam: { id: exam.id, title: exam.title, totalMarks } }, { status: 201 });
}

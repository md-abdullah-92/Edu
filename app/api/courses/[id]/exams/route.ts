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
  const exams = await Exam.find({ course: id }).select("title durationMinutes startsAt endsAt passMark questions.prompt questions.options questions.marks questions.correctIndex").lean();
  const results = user.role === "STUDENT"
    ? await Result.find({ student: user.id, exam: { $in: exams.map((exam) => exam._id) } })
      .select("+answers exam score totalMarks correctCount submittedAt")
      .lean()
    : [];
  const resultMap = new Map(results.map((result) => [String(result.exam), result]));
  return NextResponse.json({
    exams: exams.map(({ _id, questions, ...exam }) => {
      const result = resultMap.get(String(_id));
      return {
        ...exam,
        id: String(_id),
        questionCount: questions.length,
        result: result ? {
          score: result.score,
          totalMarks: result.totalMarks,
          correctCount: result.correctCount,
          submittedAt: result.submittedAt,
          passed: result.score >= exam.passMark,
          details: questions.map((question: { prompt: string; options: string[]; correctIndex: number; marks: number }, index: number) => ({
            prompt: question.prompt,
            options: question.options,
            chosenIndex: result.answers[index] ?? null,
            correctIndex: question.correctIndex,
            isCorrect: result.answers[index] === question.correctIndex,
            marks: question.marks,
            earnedMarks: result.answers[index] === question.correctIndex ? question.marks : 0
          }))
        } : null
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
  const startsAt = new Date(body?.startsAt);
  const endsAt = new Date(body?.endsAt);
  if (!title || !Array.isArray(body?.questions) || !body.questions.length ||
      !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360 ||
      !Number.isFinite(passMark) || passMark < 0 || Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || startsAt >= endsAt) {
    return errorResponse("পরীক্ষার নাম, প্রশ্ন, বৈধ সময়সীমা, pass mark এবং শুরু/শেষের সময় দিন।");
  }
  const questions = [];
  for (const question of body.questions) {
    if (typeof question?.prompt !== "string" || !question.prompt.trim() || !Array.isArray(question.options) ||
        question.options.length !== 4 || question.options.some((option: unknown) => typeof option !== "string" || !option.trim()) ||
        !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3 ||
        !Number.isFinite(Number(question.marks)) || Number(question.marks) <= 0) {
      return errorResponse("প্রতিটি প্রশ্নে চারটি অপশন, সঠিক উত্তর এবং শূন্যের বেশি নম্বর দিতে হবে।");
    }
    questions.push({
      prompt: question.prompt.trim(),
      options: question.options.map((option: string) => option.trim()),
      correctIndex: question.correctIndex,
      marks: Number(question.marks)
    });
  }
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  if (passMark > totalMarks) return errorResponse("Pass mark মোট নম্বরের বেশি হতে পারবে না।");
  await connectDB();
  if (!(await Course.exists({ _id: id }))) return errorResponse("কোর্সটি পাওয়া যায়নি।", 404);
  const exam = await Exam.create({ course: id, title, durationMinutes, startsAt, endsAt, passMark, questions, createdBy: admin.id });
  return NextResponse.json({ exam: { id: exam.id, title: exam.title, totalMarks } }, { status: 201 });
}

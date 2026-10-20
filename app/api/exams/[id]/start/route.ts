import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Attempt, Enrollment, Exam, Result } from "@/lib/models";
import { errorResponse, isValidId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { id } = await params;
  const student = await requireUser("STUDENT");
  if (!student) return errorResponse("শিক্ষার্থী হিসেবে লগইন করুন।", 401);
  if (!isValidId(id)) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  await connectDB();
  const exam = await Exam.findById(id);
  if (!exam) return errorResponse("পরীক্ষাটি পাওয়া যায়নি।", 404);
  if (!(await Enrollment.exists({ student: student.id, course: exam.course, status: "APPROVED" }))) {
    return errorResponse("পরীক্ষা দিতে Admin অনুমোদিত এনরোলমেন্ট প্রয়োজন।", 403);
  }
  const now = new Date();
  if (now < exam.startsAt || now > exam.endsAt) return errorResponse("পরীক্ষা এখন চালু নেই।");
  if (await Result.exists({ exam: exam.id, student: student.id })) return errorResponse("এই পরীক্ষা ইতিমধ্যে জমা দিয়েছেন।", 409);
  let attempt = await Attempt.findOne({ exam: exam.id, student: student.id });
  if (!attempt) {
    const expiresAt = new Date(Math.min(now.getTime() + exam.durationMinutes * 60_000, exam.endsAt.getTime()));
    try {
      attempt = await Attempt.create({ exam: exam.id, student: student.id, startedAt: now, expiresAt });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === 11000) {
        attempt = await Attempt.findOne({ exam: exam.id, student: student.id });
      } else throw error;
    }
  }
  if (!attempt || attempt.submittedAt || attempt.expiresAt < now) return errorResponse("পরীক্ষার সময় শেষ হয়েছে।", 409);
  return NextResponse.json({
    attempt: { expiresAt: attempt.expiresAt },
    exam: {
      id: exam.id,
      title: exam.title,
      questions: exam.questions.map((question: { prompt: string; options: string[]; marks: number }) => ({
        prompt: question.prompt, options: question.options, marks: question.marks
      }))
    }
  });
}

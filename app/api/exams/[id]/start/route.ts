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
  let attempt = await Attempt.findOne({ exam: exam.id, student: student.id, submittedAt: { $exists: false } }).sort({ attemptNumber: -1 });
  if (!attempt || attempt.expiresAt <= now) {
    if (attempt) {
      attempt.submittedAt = attempt.expiresAt;
      await attempt.save();
    }
    const previousAttemptCount = await Attempt.countDocuments({ exam: exam.id, student: student.id });
    const expiresAt = new Date(Math.min(now.getTime() + exam.durationMinutes * 60_000, exam.endsAt.getTime()));
    try {
      attempt = await Attempt.create({ exam: exam.id, student: student.id, attemptNumber: previousAttemptCount + 1, startedAt: now, expiresAt });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === 11000) {
        attempt = await Attempt.findOne({ exam: exam.id, student: student.id, submittedAt: { $exists: false } }).sort({ attemptNumber: -1 });
      } else throw error;
    }
  }
  if (attempt && !attempt.attemptNumber) {
    attempt.attemptNumber = 1;
    await attempt.save();
  }
  if (!attempt || attempt.submittedAt || attempt.expiresAt < now) return errorResponse("পরীক্ষার সময় শেষ হয়েছে।", 409);
  return NextResponse.json({
    attempt: { id: String(attempt._id), expiresAt: attempt.expiresAt },
    exam: {
      id: exam.id,
      title: exam.title,
      negativeMarkingEnabled: exam.negativeMarkingEnabled,
      negativeMarks: exam.negativeMarks,
      questions: exam.questions.map((question: { prompt: string; options: string[]; marks: number }) => ({
        prompt: question.prompt, options: question.options, marks: question.marks
      }))
    }
  });
}

import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    mobile: { type: String, unique: true, sparse: true, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    emailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["ADMIN", "STUDENT"], default: "STUDENT", required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const emailOtpSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, maxlength: 100 },
    passwordHash: { type: String, required: true, select: false },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, required: true },
    windowStartedAt: { type: Date, required: true },
    sentCount: { type: Number, required: true, default: 1 },
    attempts: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, maxlength: 5000 },
    coverImage: { type: String, default: "", maxlength: 300 },
    coverImageFileId: { type: Schema.Types.ObjectId },
    coverImageContentType: { type: String, enum: ["image/jpeg", "image/png", "image/webp"] },
    fee: { type: Number, required: true, min: 0 },
    paymentInstructions: { type: String, required: true, maxlength: 2000 },
    published: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

const enrollmentSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    paymentMethod: { type: String, enum: ["BKASH", "NAGAD"], required: true },
    transactionId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    senderMobile: { type: String, required: true, trim: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    rejectionReason: { type: String, maxlength: 500 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date
  },
  { timestamps: true }
);
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

const materialSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", maxlength: 2000 },
    url: { type: String, default: "", maxlength: 2000 },
    kind: { type: String, enum: ["PDF", "NOTE", "LINK"], default: "LINK" },
    fileId: { type: Schema.Types.ObjectId },
    fileName: { type: String, maxlength: 255 },
    contentType: { type: String, maxlength: 100 },
    fileSize: { type: Number, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

const examSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    durationMinutes: { type: Number, required: true, min: 1, max: 360 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    passMark: { type: Number, required: true, min: 0 },
    negativeMarkingEnabled: { type: Boolean, default: false },
    negativeMarks: { type: Number, default: 0.25, min: 0 },
    leaderboardRule: { type: String, enum: ["FIRST", "HIGHEST", "LATEST"], default: "HIGHEST" },
    questions: {
      type: [{
        prompt: { type: String, required: true, maxlength: 1000 },
        options: { type: [{ type: String, required: true, maxlength: 300 }], validate: (v: string[]) => v.length === 4 },
        correctIndex: { type: Number, required: true, min: 0, max: 3 },
        marks: { type: Number, required: true, min: 0.1 },
        explanation: { type: String, default: "", maxlength: 2000 }
      }],
      validate: (v: unknown[]) => v.length > 0
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

const resultSchema = new Schema(
  {
    exam: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: { type: [Number], required: true, select: false },
    attemptNumber: { type: Number, required: true, min: 1 },
    score: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    wrongCount: { type: Number, required: true },
    unansweredCount: { type: Number, required: true },
    submittedAt: { type: Date, required: true }
  },
  { timestamps: true }
);
resultSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });

const attemptSchema = new Schema(
  {
    exam: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: Date
  },
  { timestamps: true }
);
attemptSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const EmailOtp = mongoose.models.EmailOtp ?? mongoose.model("EmailOtp", emailOtpSchema);
export const Course = mongoose.models.Course ?? mongoose.model("Course", courseSchema);
export const Enrollment = mongoose.models.Enrollment ?? mongoose.model("Enrollment", enrollmentSchema);
export const Material = mongoose.models.Material ?? mongoose.model("Material", materialSchema);
export const Exam = mongoose.models.Exam ?? mongoose.model("Exam", examSchema);
export const Result = mongoose.models.Result ?? mongoose.model("Result", resultSchema);
export const Attempt = mongoose.models.Attempt ?? mongoose.model("Attempt", attemptSchema);

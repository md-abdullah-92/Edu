"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type User = { id: string; name: string; role: "ADMIN" | "STUDENT" };
type Course = { _id: string; title: string; description: string; coverImage?: string; fee: number; paymentInstructions: string; published: boolean };
type Enrollment = {
  _id: string; status: "PENDING" | "APPROVED" | "REJECTED"; transactionId: string; paymentMethod: string;
  senderMobile: string; rejectionReason?: string; student?: { name: string; mobile?: string; email?: string }; course: Course | { title: string; fee: number }
};
type ExamAnswerDetail = { prompt: string; options: string[]; chosenIndex: number | null; correctIndex: number; isCorrect: boolean; marks: number; earnedMarks: number; explanation: string };
type ExamResult = {
  attemptNumber: number;
  score: number;
  totalMarks: number;
  correctMarks: number;
  negativeMarksDeducted: number;
  scoreFloorApplied: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  rank: number;
  rankTotal: number;
  submittedAt: string;
  passed: boolean;
  details: ExamAnswerDetail[];
};
type ExamSubmissionSummary = {
  title: string;
  score: number;
  totalMarks: number;
  correctMarks: number;
  negativeMarksDeducted: number;
  scoreFloorApplied: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  passed: boolean;
  rank: number;
  rankTotal: number;
};
type Exam = {
  id: string; title: string; durationMinutes: number; startsAt: string; endsAt: string; passMark: number;
  questionCount: number; negativeMarkingEnabled: boolean; negativeMarks: number; leaderboardRule: "FIRST" | "HIGHEST" | "LATEST";
  results: ExamResult[]; leaderboard: Array<{ rank: number; name: string; score: number; totalMarks: number; isCurrentStudent: boolean }>;
};
type Question = { prompt: string; options: string[]; correctIndex: number; marks: number; explanation: string };
type Material = { _id: string; title: string; description: string; url: string; kind: string; fileName?: string; fileSize?: number };
type ResultRow = {
  id: string; student: { name: string; email?: string; mobile?: string }; exam: { title: string }; score: number;
  totalMarks: number; correctMarks: number; negativeMarksDeducted: number; scoreFloorApplied: boolean; rank: number; rankTotal: number;
  attemptNumber: number; correctCount: number; wrongCount: number; unansweredCount: number;
  submittedAt: string; passed: boolean;
  details: Array<{ prompt: string; chosen: string; correct: string; isCorrect: boolean; marks: number; earnedMarks: number; explanation: string }>;
};

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "01825361654";
const whatsappDigits = whatsappNumber.replace(/\D/g, "").replace(/^0/, "880");

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options?.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options?.headers },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "অনুরোধটি সম্পন্ন করা যায়নি।");
  return payload as T;
}

function money(value: number) {
  return `৳${Number(value).toLocaleString("bn-BD")}`;
}

function formatMarks(value: number) {
  return Number(value).toLocaleString("bn-BD", { maximumFractionDigits: 2 });
}

async function compressCourseImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size > 5_000_000) throw new Error("৫ MB-এর কম একটি ছবি নির্বাচন করুন।");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ছবিটি প্রক্রিয়া করা যায়নি।");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob || blob.size > 5_000_000) throw new Error("ছবিটি সংকুচিত করা যায়নি। ছোট ছবি বেছে নিন।");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function Dashboard() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [landingCourses, setLandingCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [tab, setTab] = useState("Dashboard");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [examSubmissionSummary, setExamSubmissionSummary] = useState<ExamSubmissionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [paymentCourse, setPaymentCourse] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");
  const [coverImageRemoved, setCoverImageRemoved] = useState(false);
  const [examCourse, setExamCourse] = useState<Course | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([blankQuestion()]);
  const [negativeMarkingEnabled, setNegativeMarkingEnabled] = useState(false);
  const [negativeMarks, setNegativeMarks] = useState(0.25);
  const [leaderboardRule, setLeaderboardRule] = useState<"FIRST" | "HIGHEST" | "LATEST">("HIGHEST");
  const [examTaking, setExamTaking] = useState<{ id: string; attemptId: string; title: string; negativeMarkingEnabled: boolean; negativeMarks: number; questions: Array<{ prompt: string; options: string[]; marks: number }>; expiresAt: string } | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const examQuestionList = useRef<HTMLDivElement>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const submittingExam = useRef(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialKind, setMaterialKind] = useState("PDF");
  const materialFileInput = useRef<HTMLInputElement>(null);
  const [selectedMaterialCourse, setSelectedMaterialCourse] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [adminStats, setAdminStats] = useState({ students: 0, pendingPayments: 0, courses: 0, exams: 0 });
  const [requests, setRequests] = useState<Enrollment[]>([]);
  const [rejectionTarget, setRejectionTarget] = useState<Enrollment | null>(null);
  const [students, setStudents] = useState<Array<{ _id: string; name: string; email?: string; mobile?: string; active: boolean; createdAt: string; enrollments: number; results: number }>>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);

  function blankQuestion(): Question {
    return { prompt: "", options: ["", "", "", ""], correctIndex: 0, marks: 1, explanation: "" };
  }

  useEffect(() => {
    setCoverImageUrl(editingCourse?.coverImage ?? "");
    setCoverImageFile(null);
    setCoverImageRemoved(false);
  }, [editingCourse]);

  useEffect(() => {
    if (!coverImageFile) {
      setCoverImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(coverImageFile);
    setCoverImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coverImageFile]);

  const loadBase = useCallback(async (current: User) => {
    const [courseData, enrollmentData] = await Promise.all([
      api<{ courses: Course[] }>("/api/courses"),
      current.role === "STUDENT" ? api<{ enrollments: Enrollment[] }>("/api/enrollments") : Promise.resolve({ enrollments: [] })
    ]);
    setCourses(courseData.courses);
    setEnrollments(enrollmentData.enrollments);
    if (current.role === "ADMIN") {
      const [overview, payments, studentData, resultData] = await Promise.all([
        api<{ stats: typeof adminStats }>("/api/admin/overview"),
        api<{ requests: Enrollment[] }>("/api/admin/payment-requests"),
        api<{ students: typeof students }>("/api/admin/students"),
        api<{ results: ResultRow[] }>("/api/admin/results")
      ]);
      setAdminStats(overview.stats);
      setRequests(payments.requests);
      setStudents(studentData.students);
      setResults(resultData.results);
    }
  }, []);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me")
      .then(({ user: current }) => {
        if (!current) {
          return api<{ courses: Course[] }>("/api/courses").then(({ courses: publicCourses }) => setLandingCourses(publicCourses));
        }
        setUser(current);
        setTab(current.role === "ADMIN" ? "Dashboard" : "Course Catalog");
        return loadBase(current);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setInitializing(false));
  }, [loadBase]);

  useEffect(() => {
    if (!examTaking) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [examTaking]);

  useEffect(() => {
    if (!user || !((tab === "Exams" && user.role === "STUDENT") || (tab === "MCQ Exam Builder" && user.role === "ADMIN"))) return;
    const courseId = selectedMaterialCourse;
    if (!courseId) return;
    api<{ exams: Exam[] }>(`/api/courses/${courseId}/exams`).then(({ exams }) => setExams(exams)).catch((cause: Error) => setError(cause.message));
  }, [user, tab, selectedMaterialCourse]);

  useEffect(() => {
    if (!user || tab !== "Study Materials" || !selectedMaterialCourse) return;
    api<{ materials: Material[] }>(`/api/courses/${selectedMaterialCourse}/materials`)
      .then(({ materials }) => setMaterials(materials)).catch((cause: Error) => setError(cause.message));
  }, [user, tab, selectedMaterialCourse]);

  async function submitForm(event: FormEvent<HTMLFormElement>, action: (form: FormData) => Promise<void>) {
    event.preventDefault();
    await runAction(() => action(new FormData(event.currentTarget)));
  }

  async function runAction(action: () => Promise<void>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "কাজটি সম্পন্ন করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (user) await loadBase(user);
  }

  async function handleAuth(form: FormData) {
    const response = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    setUser(response.user);
    setTab(response.user.role === "ADMIN" ? "Dashboard" : "Course Catalog");
    await loadBase(response.user);
    setMessage("স্বাগতম, " + response.user.name);
  }

  async function registerStudent(form: FormData) {
    const response = await api<{ email: string; message: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") })
    });
    setPendingEmail(response.email);
    setMessage(response.message);
  }

  async function verifyRegistration(form: FormData) {
    const response = await api<{ user: User }>("/api/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail, code: form.get("code") })
    });
    setUser(response.user);
    setPendingEmail("");
    setTab("Course Catalog");
    await loadBase(response.user);
    setMessage("ইমেইল যাচাই সম্পন্ন। স্বাগতম, " + response.user.name);
  }

  async function resendRegistrationOtp() {
    const response = await api<{ message: string }>("/api/auth/register/resend", {
      method: "POST",
      body: JSON.stringify({ email: pendingEmail })
    });
    setMessage(response.message);
  }

  async function signOut() {
    const confirmation = examTaking
      ? "আপনি পরীক্ষা দিচ্ছেন। লগআউট করলে আপনার এই পরীক্ষার উত্তরগুলো হারিয়ে যাবে। লগআউট করবেন?"
      : "আপনি কি EduPrepX থেকে লগআউট করতে চান?";
    if (!window.confirm(confirmation)) return;
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setShowAuth(false);
      setExamTaking(null);
      setCourses([]);
      setEnrollments([]);
      setMessage("আপনি সফলভাবে লগআউট করেছেন।");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "লগআউট করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  async function submitPayment(form: FormData) {
    if (!paymentCourse) return;
    const result = await api<{ message: string }>("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({
        courseId: paymentCourse._id, paymentMethod: form.get("paymentMethod"),
        transactionId: form.get("transactionId"), senderMobile: form.get("senderMobile")
      })
    });
    setPaymentCourse(null);
    setMessage(result.message);
    await refresh();
  }

  async function decidePayment(enrollment: Enrollment, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED") {
      setError("");
      setMessage("");
      setRejectionTarget(enrollment);
      return;
    }
    await runAction(async () => {
      await api(`/api/admin/payment-requests/${enrollment._id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage("পেমেন্ট অনুমোদিত হয়েছে।");
      await refresh();
    });
  }

  async function rejectPayment(form: FormData) {
    if (!rejectionTarget) return;
    const rejectionReason = String(form.get("rejectionReason") ?? "").trim();
    await api(`/api/admin/payment-requests/${rejectionTarget._id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "REJECTED", rejectionReason })
    });
    setRejectionTarget(null);
    setMessage("পেমেন্ট রিকোয়েস্ট প্রত্যাখ্যান হয়েছে। কারণটি শিক্ষার্থী দেখতে পাবেন।");
    await refresh();
  }

  async function toggleStudent(student: typeof students[number]) {
    try {
      await api(`/api/admin/students/${student._id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !student.active })
      });
      setMessage(student.active ? "শিক্ষার্থীর অ্যাকাউন্ট নিষ্ক্রিয় হয়েছে।" : "শিক্ষার্থীর অ্যাকাউন্ট সক্রিয় হয়েছে।");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "অ্যাকাউন্টের অবস্থা পরিবর্তন করা যায়নি।");
    }
  }

  async function uploadCourseCover(courseId: string, file: File) {
    const formData = new FormData();
    formData.append("image", file);
    const response = await fetch(`/api/courses/${courseId}/cover`, { method: "PUT", body: formData, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "কোর্সের ছবি আপলোড করা যায়নি।");
  }

  async function createCourse(form: FormData) {
    const { course } = await api<{ course: Course }>("/api/courses", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"), description: form.get("description"), fee: Number(form.get("fee")),
        paymentInstructions: form.get("paymentInstructions"), published: form.get("published") === "on"
      })
    });
    if (coverImageFile) {
      try {
        await uploadCourseCover(course._id, coverImageFile);
      } catch (cause) {
        setCoverImageFile(null);
        await refresh();
        throw new Error(`কোর্স তৈরি হয়েছে, কিন্তু ছবি আপলোড হয়নি। কোর্সটি সম্পাদনা করে আবার চেষ্টা করুন। ${cause instanceof Error ? cause.message : ""}`);
      }
    }
    setMessage("কোর্স তৈরি হয়েছে।");
    setCoverImageFile(null);
    await refresh();
  }

  async function saveCourse(form: FormData) {
    if (!editingCourse) return;
    await api(`/api/courses/${editingCourse._id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: form.get("title"), description: form.get("description"), fee: Number(form.get("fee")),
        paymentInstructions: form.get("paymentInstructions"), published: form.get("published") === "on"
      })
    });
    if (coverImageFile) await uploadCourseCover(editingCourse._id, coverImageFile);
    else if (coverImageRemoved) await api(`/api/courses/${editingCourse._id}/cover`, { method: "DELETE" });
    setEditingCourse(null);
    setMessage("কোর্স আপডেট হয়েছে।");
    await refresh();
  }

  async function updateCourse(course: Course, published: boolean) {
    await api(`/api/courses/${course._id}`, { method: "PATCH", body: JSON.stringify({ published }) });
    await refresh();
    setMessage(published ? "কোর্স প্রকাশিত হয়েছে।" : "কোর্সের প্রকাশনা বন্ধ হয়েছে।");
  }

  async function deleteCourse(course: Course) {
    const confirmed = window.confirm(`"${course.title}" কোর্সটি স্থায়ীভাবে মুছে যাবে। এর এনরোলমেন্ট, স্টাডি ম্যাটেরিয়াল, পরীক্ষা, সব ফলাফল এবং কভার ছবিও মুছে যাবে। এগিয়ে যাবেন?`);
    if (!confirmed) return;
    await api(`/api/courses/${course._id}`, { method: "DELETE" });
    if (selectedMaterialCourse === course._id) {
      setSelectedMaterialCourse("");
      setExams([]);
      setMaterials([]);
    }
    setEditingCourse(null);
    setMessage("কোর্স ও সংশ্লিষ্ট তথ্য মুছে ফেলা হয়েছে।");
    await refresh();
  }

  async function createMaterial(form: FormData) {
    const courseId = String(form.get("courseId"));
    if (materialKind === "PDF") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) throw new Error("PDF ফাইল নির্বাচন করুন।");
      if (file.type !== "application/pdf" || file.size > 20_000_000) throw new Error("২০ MB-এর কম একটি বৈধ PDF ফাইল দিন।");
      form.delete("kind");
      form.delete("url");
      await api(`/api/courses/${courseId}/materials`, { method: "POST", body: form });
      if (materialFileInput.current) materialFileInput.current.value = "";
    } else {
      await api(`/api/courses/${courseId}/materials`, {
        method: "POST", body: JSON.stringify({
          title: form.get("title"), description: form.get("description"), url: form.get("url"), kind: materialKind
        })
      });
    }
    setMessage("স্টাডি ম্যাটেরিয়াল যুক্ত হয়েছে।");
    form.set("title", "");
    if (selectedMaterialCourse === courseId) {
      const data = await api<{ materials: Material[] }>(`/api/courses/${courseId}/materials`);
      setMaterials(data.materials);
    }
  }

  async function createExam(form: FormData) {
    if (!examCourse) return;
    const result = await api<{ exam: { title: string } }>(`/api/courses/${examCourse._id}/exams`, {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"), durationMinutes: Number(form.get("durationMinutes")),
        passMark: Number(form.get("passMark")), startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(), questions: examQuestions,
        negativeMarkingEnabled, negativeMarks, leaderboardRule
      })
    });
    setMessage(`"${result.exam.title}" পরীক্ষা তৈরি হয়েছে।`);
    setExamCourse(null);
    setExamQuestions([blankQuestion()]);
    setNegativeMarkingEnabled(false);
    setNegativeMarks(0.25);
    setLeaderboardRule("HIGHEST");
    await refresh();
  }

  async function startExam(exam: Exam) {
    try {
      const data = await api<{ exam: { id: string; title: string; negativeMarkingEnabled: boolean; negativeMarks: number; questions: Array<{ prompt: string; options: string[]; marks: number }> }; attempt: { id: string; expiresAt: string } }>(`/api/exams/${exam.id}/start`, { method: "POST" });
      setExamSubmissionSummary(null);
      setExamTaking({ ...data.exam, attemptId: data.attempt.id, expiresAt: data.attempt.expiresAt });
      setAnswers(data.exam.questions.map(() => -1));
      setCurrentQuestion(0);
      setRemainingSeconds(Math.max(0, Math.ceil((new Date(data.attempt.expiresAt).getTime() - Date.now()) / 1000)));
      submittingExam.current = false;
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "পরীক্ষা শুরু করা যায়নি।"); }
  }

  async function submitExam(autoSubmit = false) {
    if (!examTaking || submittingExam.current) return;
    const unansweredCount = answers.filter((answer) => answer < 0).length;
    if (!autoSubmit && unansweredCount > 0 && !window.confirm(`আপনি ${unansweredCount}টি প্রশ্নের উত্তর দেননি। ফাঁকা উত্তরসহ পরীক্ষা জমা দেবেন?`)) return;
    submittingExam.current = true;
    setIsSubmittingExam(true);
    try {
      const data = await api<{ result: Omit<ExamSubmissionSummary, "title"> & { questionCount: number } }>(`/api/exams/${examTaking.id}/submit`, {
        method: "POST", body: JSON.stringify({ attemptId: examTaking.attemptId, answers })
      });
      setExamSubmissionSummary({ title: examTaking.title, ...data.result });
      setMessage("");
      setExamTaking(null);
      if (selectedMaterialCourse) {
        const { exams: updatedExams } = await api<{ exams: Exam[] }>(`/api/courses/${selectedMaterialCourse}/exams`);
        setExams(updatedExams);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "উত্তর জমা করা যায়নি।");
      submittingExam.current = false;
    } finally {
      setIsSubmittingExam(false);
    }
  }

  useEffect(() => {
    if (!examTaking) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((new Date(examTaking.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) void submitExam(true);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [examTaking, answers]);

  useEffect(() => {
    if (!examTaking || !examQuestionList.current) return;
    const observer = new IntersectionObserver((entries) => {
      const visibleQuestion = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (!visibleQuestion) return;
      const index = Number((visibleQuestion.target as HTMLElement).dataset.questionIndex);
      if (Number.isInteger(index)) setCurrentQuestion(index);
    }, { rootMargin: "-145px 0px -55% 0px", threshold: 0.1 });
    examQuestionList.current.querySelectorAll(".take-question").forEach((question) => observer.observe(question));
    return () => observer.disconnect();
  }, [examTaking]);

  const navItems = user?.role === "ADMIN"
    ? ["Dashboard", "Students", "Payment Requests", "Courses", "Study Materials", "MCQ Exam Builder", "Results"]
    : ["Course Catalog", "My Enrollments", "Study Materials", "Exams"];

  if (initializing) return <main className="app-loading" role="status" aria-live="polite"><span className="brand-mark" aria-hidden="true">E</span><strong>EduPrepX</strong><span>আপনার অ্যাকাউন্ট লোড হচ্ছে…</span><i /></main>;

  if (!user) {
    if (!showAuth) return <LandingPage
      courses={landingCourses}
      error={error}
      onLogin={() => { setAuthTab("login"); setShowAuth(true); }}
      onRegister={() => { setAuthTab("register"); setShowAuth(true); }}
    />;
    return <main className="auth-page">
      <div className="auth-aside"><button className="brand brand-light landing-back" onClick={() => setShowAuth(false)}><span className="brand-mark">E</span> EduPrepX</button><div><span className="eyebrow">LEARN · PRACTICE · SUCCEED</span><h1>আপনার প্রস্তুতিকে<br /><em>পরবর্তী স্তরে</em> নিন।</h1><p>কোর্স, শেখার উপকরণ ও অনলাইন পরীক্ষা—সব এক জায়গায়।</p></div><span className="aside-foot">বিশ্বাসের সঙ্গে শিখুন, আত্মবিশ্বাসের সঙ্গে এগিয়ে যান।</span></div>
      <div className="auth-main"><div className="auth-card"><div className="mobile-brand"><span className="brand-mark">E</span> EduPrepX</div><span className="eyebrow">EDUPREPX PORTAL</span><h2>{authTab === "login" ? "আপনার অ্যাকাউন্টে প্রবেশ করুন" : pendingEmail ? "আপনার ইমেইল যাচাই করুন" : "শিক্ষার্থী অ্যাকাউন্ট তৈরি করুন"}</h2><p className="muted">কোর্স, শেখার উপকরণ ও অনলাইন পরীক্ষায় অংশ নিতে EduPrepX-এ প্রবেশ করুন।</p>
        <button className="landing-back mobile-auth-back" onClick={() => setShowAuth(false)}>← হোমপেজে ফিরে যান</button>
        <div className="auth-tabs" role="tablist" aria-label="অ্যাকাউন্ট">
          <button type="button" role="tab" aria-selected={authTab === "login"} className={authTab === "login" ? "active" : ""} disabled={busy} onClick={() => setAuthTab("login")}>লগইন</button>
          <button type="button" role="tab" aria-selected={authTab === "register"} className={authTab === "register" ? "active" : ""} disabled={busy} onClick={() => setAuthTab("register")}>শিক্ষার্থী নিবন্ধন</button>
        </div>
        {authTab === "login" ? <form onSubmit={(event) => submitForm(event, handleAuth)} className="stack-form" role="tabpanel">
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" placeholder="আপনার পাসওয়ার্ড" autoComplete="current-password" required /></label>
          <button className="primary wide" disabled={busy}>{busy ? "অপেক্ষা করুন..." : "লগইন করুন"} <span>→</span></button>
        </form> : pendingEmail ? <form id="register-form" onSubmit={(event) => submitForm(event, verifyRegistration)} className="stack-form" role="tabpanel">
          <p className="muted">আমরা <strong>{pendingEmail}</strong>-এ ৬ সংখ্যার যাচাই কোড পাঠিয়েছি। কোডটি ১০ মিনিট বৈধ থাকবে।</p>
          <label>ইমেইল যাচাই কোড<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="৬ সংখ্যার OTP" required /></label>
          <button className="primary wide" disabled={busy}>ইমেইল যাচাই করে অ্যাকাউন্ট তৈরি করুন</button>
          <button type="button" className="text-button" disabled={busy} onClick={() => runAction(resendRegistrationOtp)}>আবার OTP পাঠান</button>
          <button type="button" className="text-button" onClick={() => setPendingEmail("")}>ইমেইল পরিবর্তন করুন</button>
        </form> : <form id="register-form" onSubmit={(event) => submitForm(event, registerStudent)} className="stack-form" role="tabpanel">
          <label>পূর্ণ নাম<input name="name" placeholder="আপনার নাম" autoComplete="name" required maxLength={100} /></label>
          <label>Gmail / Email address<input name="email" type="email" autoComplete="email" placeholder="you@gmail.com" required /></label>
          <label>পাসওয়ার্ড<input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="অন্তত ৮ অক্ষর" required /></label>
          <button className="secondary wide" disabled={busy}>OTP দিয়ে শিক্ষার্থী অ্যাকাউন্ট তৈরি করুন</button>
        </form>}
        {error && <p className="alert error" role="alert" aria-live="assertive">{error}</p>}{message && <p className="alert success" role="status" aria-live="polite">{message}</p>}
      </div></div>
    </main>;
  }

  const title = navigationLabel(tab);
  const paymentCourseName = (enrollment: Enrollment) => typeof enrollment.course === "object" ? enrollment.course.title : "";

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">E</span><span>EduPrepX<small>LEARNING PORTAL</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <nav>{navItems.map((item) => <button key={item} onClick={() => {
        if (item === tab) return;
        if (examTaking && !window.confirm("এই পরীক্ষার উত্তরগুলো জমা হয়নি। পৃষ্ঠা ছাড়লে আপনার বাছাই করা উত্তর হারিয়ে যাবে। তবু পৃষ্ঠা ছাড়বেন?")) return;
        setTab(item);
        setExamTaking(null);
      }} className={`nav-item ${tab === item ? "selected" : ""}`} aria-current={tab === item ? "page" : undefined}><span className="nav-icon">{icon(item)}</span>{navigationLabel(item)}{item === "Payment Requests" && adminStats.pendingPayments > 0 && <span className="nav-count">{adminStats.pendingPayments}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="support-box"><span className="support-icon">✦</span><strong>কোনো সাহায্য দরকার?</strong><p>পেমেন্ট বা কোর্স নিয়ে সহায়তা নিন।</p>{user.role === "STUDENT" ? <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">WhatsApp-এ যোগাযোগ · {whatsappNumber} →</a> : <a href="mailto:support@eduprepx.com">সহায়তা কেন্দ্রে যোগাযোগ →</a>}</div><div className="user-mini"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === "ADMIN" ? "Administrator" : "Student"}</small></div></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="breadcrumb">EduPrepX <span>/</span> {title}</span><h1>{title}</h1></div><div className="top-actions"><span className="today">{new Date().toLocaleDateString("bn-BD", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>{user.role === "ADMIN" && adminStats.pendingPayments > 0 && <button className="notification" title={`${adminStats.pendingPayments}টি পেমেন্ট রিকোয়েস্ট অপেক্ষায়`} aria-label={`${adminStats.pendingPayments}টি পেমেন্ট রিকোয়েস্ট পর্যালোচনা করুন`} onClick={() => setTab("Payment Requests")}>৳<i /></button>}<span className="avatar" aria-label={user.name}>{user.name.slice(0, 1).toUpperCase()}</span><button className="logout-button" onClick={signOut}><span aria-hidden="true">↪</span><span>লগআউট</span></button></div></header>
      <div className="content">
        {user.role === "STUDENT" && <a className="mobile-support-link" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer"><span className="mobile-support-icon" aria-hidden="true">↗</span><span><strong>সাহায্য দরকার?</strong><small>WhatsApp-এ যোগাযোগ · {whatsappNumber}</small></span><b aria-hidden="true">→</b></a>}
        {user.role === "ADMIN" && tab === "Results" ? <AdminResultsPanel results={results} onRefresh={refresh} /> : <>
        {user.role === "ADMIN" && tab === "Courses" && !editingCourse && <div className="panel course-cover-editor"><div><strong>কোর্সের কভার ছবি</strong><p className="muted">JPEG, PNG বা WebP · সর্বোচ্চ ৫ MB; ছবির ফাইল MongoDB GridFS-এ থাকবে।</p></div><label className="cover-upload">ছবি নির্বাচন করুন<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runAction(async () => { setCoverImageFile(await compressCourseImage(file)); setCoverImageRemoved(false); }); }} /></label>{coverImagePreview && <><img src={coverImagePreview} alt="কোর্স কভার প্রিভিউ" /><button className="text-button danger-text" type="button" onClick={() => setCoverImageFile(null)}>ছবি সরান</button></>}</div>}
        {user.role === "ADMIN" && tab === "MCQ Exam Builder" && examCourse && <div className="panel exam-authoring-settings"><h3>পরীক্ষার নম্বর ও ব্যাখ্যা</h3><div className="exam-settings-grid"><label className="check-label"><input type="checkbox" checked={negativeMarkingEnabled} onChange={(event) => setNegativeMarkingEnabled(event.target.checked)} /> ভুল উত্তরে নম্বর কাটুন</label><label>প্রতি ভুল উত্তরে কর্তন<input type="number" min="0" step="0.01" value={negativeMarks} disabled={!negativeMarkingEnabled} onChange={(event) => setNegativeMarks(Number(event.target.value))} /></label><label>মেধাতালিকার নিয়ম<select value={leaderboardRule} onChange={(event) => setLeaderboardRule(event.target.value as typeof leaderboardRule)}><option value="FIRST">প্রথম প্রচেষ্টা</option><option value="HIGHEST">সর্বোচ্চ নম্বর</option><option value="LATEST">সর্বশেষ প্রচেষ্টা</option></select></label></div></div>}
        {message && <div className="alert success dismissible" role="status" aria-live="polite">{message}<button aria-label="বার্তা বন্ধ করুন" onClick={() => setMessage("")}>×</button></div>}
        {error && !rejectionTarget && <div className="alert error dismissible" role="alert" aria-live="assertive">{error}<button aria-label="ত্রুটির বার্তা বন্ধ করুন" onClick={() => setError("")}>×</button></div>}
        {user.role === "STUDENT" && tab === "Exams" && examSubmissionSummary && <section className={`exam-submission-summary ${examSubmissionSummary.passed ? "passed" : "not-passed"}`} aria-label="পরীক্ষার ফলাফল">
          <div className="exam-submission-heading">
            <div><span className="eyebrow">পরীক্ষার ফলাফল</span><h2>{examSubmissionSummary.title}</h2><p>{examSubmissionSummary.passed ? "অভিনন্দন, আপনি পাস করেছেন!" : "এবার পাস করা হয়নি—প্রস্তুতি নিয়ে আবার চেষ্টা করুন।"}</p></div>
            <button type="button" className="icon-button" aria-label="ফলাফলের বার্তা বন্ধ করুন" onClick={() => setExamSubmissionSummary(null)}>×</button>
          </div>
          <div className="exam-submission-score"><strong>{formatMarks(examSubmissionSummary.score)}<span> / {formatMarks(examSubmissionSummary.totalMarks)}</span></strong><span>চূড়ান্ত প্রাপ্ত নম্বর</span></div>
          <div className="exam-submission-metrics">
            <div><span>সঠিক উত্তরের নম্বর</span><strong>{formatMarks(examSubmissionSummary.correctMarks)}</strong></div>
            <div><span>নেগেটিভ কাটা</span><strong className={examSubmissionSummary.negativeMarksDeducted ? "deducted-marks" : ""}>{formatMarks(examSubmissionSummary.negativeMarksDeducted)}{examSubmissionSummary.scoreFloorApplied && <small> সর্বনিম্ন ০</small>}</strong></div>
            <div className="exam-rank-metric"><div><span>Your position</span><strong>{examSubmissionSummary.rank.toLocaleString("en-US")}</strong></div><div><span>Total participants</span><strong>{examSubmissionSummary.rankTotal.toLocaleString("en-US")}</strong></div></div>
            <div><span>সঠিক · ভুল · বাদ</span><strong>{examSubmissionSummary.correctCount} · {examSubmissionSummary.wrongCount} · {examSubmissionSummary.unansweredCount}</strong></div>
          </div>
        </section>}
        {user.role === "ADMIN" && tab === "Dashboard" && <section>
          <div className="welcome-row"><div><span className="eyebrow">সারসংক্ষেপ</span><h2>শুভেচ্ছা, {user.name.split(" ")[0]} 👋</h2><p className="muted">আপনার প্ল্যাটফর্মের আজকের সারসংক্ষেপ।</p></div><button className="secondary" onClick={refresh}>↻ &nbsp;তথ্য হালনাগাদ</button></div>
          <div className="stat-grid">{[
            ["মোট শিক্ষার্থী", adminStats.students, "♧", "সক্রিয় শিক্ষার্থী অ্যাকাউন্ট"],
            ["অপেক্ষমাণ পেমেন্ট", adminStats.pendingPayments, "৳", "যাচাইয়ের জন্য অপেক্ষায়"],
            ["মোট কোর্স", adminStats.courses, "▤", "প্রকাশিত ও খসড়া কোর্স"],
            ["MCQ পরীক্ষা", adminStats.exams, "▣", "তৈরি করা পরীক্ষা"]
          ].map(([label, value, ico, caption], index) => <div className="stat-card" key={label}><div className={`stat-icon tone-${index}`}>{ico}</div><div className="stat-caption">{caption}</div><div className="stat-value">{Number(value).toLocaleString("bn-BD")}</div><div className="stat-label">{label}</div></div>)}</div>
          <div className="section-heading"><div><h3>সাম্প্রতিক পেমেন্ট</h3><p className="muted">সর্বশেষ পেমেন্ট রিকোয়েস্টের অবস্থা</p></div><button className="text-button" onClick={() => setTab("Payment Requests")}>সব দেখুন →</button></div>
          <PaymentTable requests={requests.slice(0, 5)} decide={decidePayment} isAdmin />
          <p className="demo-note">Dashboard-এর সংখ্যা ডাটাবেস থেকে আসছে; এগুলো নমুনা বা Demo সংখ্যা নয়।</p>
        </section>}
        {user.role === "ADMIN" && tab === "Students" && <section><div className="section-heading"><div><h2>শিক্ষার্থী পরিচালনা</h2><p className="muted">নিবন্ধিত শিক্ষার্থীদের অ্যাকাউন্ট ও কার্যক্রম</p></div><span className="pill">{students.length} জন</span></div><div className="table-wrap admin-mobile-cards"><table><thead><tr><th>শিক্ষার্থী</th><th>ইমেইল</th><th>এনরোলমেন্ট</th><th>পরীক্ষার ফল</th><th>অ্যাকাউন্ট</th><th>যোগদানের তারিখ</th><th>পরিচালনা</th></tr></thead><tbody>{students.map((student) => <tr key={student._id}><td data-label="শিক্ষার্থী"><div className="person"><span className="avatar small">{student.name.slice(0, 1)}</span><strong>{student.name}</strong></div></td><td data-label="ইমেইল">{student.email ?? student.mobile ?? "—"}</td><td data-label="এনরোলমেন্ট">{student.enrollments}</td><td data-label="পরীক্ষার ফল">{student.results}</td><td data-label="অ্যাকাউন্ট"><span className={`status ${student.active ? "approved" : "rejected"}`}>{student.active ? "সক্রিয়" : "নিষ্ক্রিয়"}</span></td><td data-label="যোগদানের তারিখ">{new Date(student.createdAt).toLocaleDateString("bn-BD")}</td><td data-label="পরিচালনা"><button className={student.active ? "reject-button" : "approve-button"} onClick={() => toggleStudent(student)}>{student.active ? "নিষ্ক্রিয় করুন" : "সক্রিয় করুন"}</button></td></tr>)}</tbody></table>{students.length === 0 && <Empty text="কোনো শিক্ষার্থী নেই।" />}</div></section>}
        {user.role === "ADMIN" && tab === "Payment Requests" && <section><div className="section-heading"><div><h2>পেমেন্ট রিকোয়েস্ট</h2><p className="muted">Transaction ID এবং পেমেন্টের তথ্য ম্যানুয়ালি যাচাই করুন।</p></div><span className="pill amber">{requests.filter((request) => request.status === "PENDING").length} Pending</span></div><PaymentTable requests={requests} decide={decidePayment} isAdmin /></section>}
        {user.role === "ADMIN" && tab === "Courses" && <section className="admin-management admin-courses">
          <div className="section-heading admin-management-heading"><div><span className="eyebrow">কোর্স ব্যবস্থাপনা</span><h2>কোর্স পরিচালনা</h2><p className="muted">কোর্স তৈরি, মূল্য ও প্রকাশনার অবস্থা এখান থেকে নিয়ন্ত্রণ করুন।</p></div><span className="pill">{courses.length}টি কোর্স</span></div>
          <div className="two-panel admin-management-panels">
            <form className="panel stack-form admin-create-panel" onSubmit={(event) => submitForm(event, createCourse)}>
              <div className="admin-panel-heading"><span className="admin-panel-icon course-panel-icon" aria-hidden="true">＋</span><div><h3>নতুন কোর্স তৈরি</h3><p>শিক্ষার্থীদের জন্য কোর্সের তথ্য যোগ করুন।</p></div></div>
              <label>কোর্সের নাম<input name="title" placeholder="যেমন: BCS প্রিলিমিনারি প্রস্তুতি" required /></label>
              <label>কোর্সের বিবরণ<textarea name="description" rows={3} placeholder="কোর্সে কী শেখানো হবে সংক্ষেপে লিখুন" required /></label>
              <label>কোর্স ফি (৳)<input name="fee" type="number" min="0" step="1" placeholder="যেমন: ১৫০০" required /><small className="form-hint">বিনামূল্যের কোর্স হলে ০ লিখুন।</small></label>
              <label>পেমেন্ট নির্দেশনা<textarea name="paymentInstructions" rows={2} placeholder="পেমেন্ট নম্বর ও টাকা পাঠানোর নিয়ম লিখুন" required /></label>
              <label className="check-label admin-publish-check"><input type="checkbox" name="published" /> তৈরি করেই শিক্ষার্থীদের জন্য প্রকাশ করুন</label>
              <button className="primary admin-form-submit" disabled={busy}>{busy ? "তৈরি হচ্ছে…" : "কোর্স তৈরি করুন"}</button>
            </form>
            <div className="panel admin-course-list-panel">
              <div className="admin-panel-heading"><span className="admin-panel-icon course-list-icon" aria-hidden="true">▤</span><div><h3>সকল কোর্স</h3><p>প্রকাশিত ও খসড়া কোর্সের তালিকা।</p></div><span className="pill">{courses.length}</span></div>
              <div className="admin-course-list">{courses.map((course) => <article className="course-admin" key={course._id}>
                <div className="course-admin-info"><div className="course-admin-title-row"><strong>{course.title}</strong><span className={`status ${course.published ? "approved" : "pending"}`}>{course.published ? "প্রকাশিত" : "খসড়া"}</span></div><p className="course-admin-description">{course.description}</p><span className="course-admin-fee">{money(course.fee)} <small>কোর্স ফি</small></span></div>
                <div className="action-row course-admin-actions"><button className="small-button" onClick={() => setEditingCourse(course)}>সম্পাদনা</button><button className={course.published ? "small-button" : "small-button primary-small"} onClick={() => updateCourse(course, !course.published)}>{course.published ? "প্রকাশনা বন্ধ" : "প্রকাশ করুন"}</button><button className="small-button delete-course-button" onClick={() => void runAction(() => deleteCourse(course))}>মুছুন</button></div>
              </article>)}{!courses.length && <Empty text="এখনও কোনো কোর্স তৈরি হয়নি। বাম পাশের ফর্মটি পূরণ করে প্রথম কোর্স তৈরি করুন।" />}</div>
            </div>
          </div>
        </section>}
        {user.role === "ADMIN" && tab === "Study Materials" && <section className="admin-management admin-materials">
          <div className="section-heading admin-management-heading"><div><span className="eyebrow">শেখার উপকরণ</span><h2>স্টাডি ম্যাটেরিয়াল</h2><p className="muted">কোর্সভিত্তিক PDF, নোট ও দরকারি লিংক যোগ করে শিক্ষার্থীদের সঙ্গে শেয়ার করুন।</p></div></div>
          <div className="two-panel admin-management-panels">
            <form className="panel stack-form admin-create-panel" onSubmit={(event) => submitForm(event, createMaterial)}>
              <div className="admin-panel-heading"><span className="admin-panel-icon material-panel-icon" aria-hidden="true">＋</span><div><h3>নতুন উপকরণ যোগ করুন</h3><p>প্রথমে কোর্স ও উপকরণের ধরন বেছে নিন।</p></div></div>
              <label>কোর্স<select name="courseId" required defaultValue=""><option value="" disabled>কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label>
              <label>উপকরণের শিরোনাম<input name="title" placeholder="যেমন: অধ্যায় ১ — গুরুত্বপূর্ণ নোট" required /></label>
              <label>উপকরণের ধরন<select value={materialKind} onChange={(event) => setMaterialKind(event.target.value)}><option value="PDF">PDF ফাইল আপলোড</option><option value="NOTE">অনলাইন নোটের লিংক</option><option value="LINK">বাহ্যিক ওয়েবসাইটের লিংক</option></select></label>
              {materialKind === "PDF" ? <><label>PDF ফাইল · সর্বোচ্চ ২০ MB<input ref={materialFileInput} name="file" type="file" accept="application/pdf,.pdf" required /></label><p className="form-hint">PDF ফাইলটি সরাসরি আপলোড হবে। সর্বোচ্চ ফাইল সাইজ ২০ MB।</p></> : <label>উপকরণের URL<input name="url" type="url" placeholder="https://example.com/notes" required /><small className="form-hint">সম্পূর্ণ https:// বা http:// লিংক ব্যবহার করুন।</small></label>}
              <label>সংক্ষিপ্ত বিবরণ<textarea name="description" rows={2} placeholder="শিক্ষার্থীদের জন্য প্রয়োজনীয় নির্দেশনা (ঐচ্ছিক)" /></label>
              <button className="primary admin-form-submit" disabled={busy}>{busy ? "যোগ হচ্ছে…" : "উপকরণ যোগ করুন"}</button>
            </form>
            <div className="panel admin-material-list-panel">
              <div className="admin-panel-heading"><span className="admin-panel-icon material-list-icon" aria-hidden="true">▧</span><div><h3>কোর্সের উপকরণ</h3><p>কোর্স নির্বাচন করে যোগ করা উপকরণগুলো দেখুন।</p></div>{selectedMaterialCourse && <span className="pill">{materials.length}টি</span>}</div>
              <label className="admin-material-course-select">কোর্স<select value={selectedMaterialCourse} onChange={(event) => setSelectedMaterialCourse(event.target.value)}><option value="">কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label>
              {!selectedMaterialCourse && <p className="admin-material-hint">কোর্স নির্বাচন করলে তার PDF, নোট ও লিংকের তালিকা এখানে দেখা যাবে।</p>}
              <MaterialList materials={materials} />
            </div>
          </div>
        </section>}
        {user.role === "ADMIN" && tab === "MCQ Exam Builder" && <section><div className="section-heading"><div><h2>MCQ Exam Builder</h2><p className="muted">সঠিক উত্তর সার্ভার-সাইডে সংরক্ষিত হবে, পরীক্ষার্থীর কাছে যাবে না।</p></div><button className="primary" onClick={() => setExamCourse(courses[0] ?? null)}>＋ নতুন পরীক্ষা</button></div>{examCourse && <form className="panel exam-builder stack-form" onSubmit={(event) => submitForm(event, createExam)}><div className="section-heading"><h3>পরীক্ষার তথ্য</h3><button type="button" className="icon-button" onClick={() => setExamCourse(null)}>×</button></div><label>কোর্স<select value={examCourse._id} onChange={(event) => setExamCourse(courses.find((course) => course._id === event.target.value) ?? null)}>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label><label>পরীক্ষার শিরোনাম<input name="title" placeholder="যেমন: Data Structure — Weekly Quiz" required /></label><div className="three-col"><label>সময় (মিনিট)<input name="durationMinutes" type="number" min="1" max="360" defaultValue="30" required /></label><label>Pass mark<input name="passMark" type="number" min="0" step="0.5" defaultValue="5" required /></label><label>শুরু হবে<input name="startsAt" type="datetime-local" required /></label></div><label>শেষ হবে<input name="endsAt" type="datetime-local" required /></label><div className="builder-heading"><h3>প্রশ্ন ও উত্তর</h3><span className="muted">প্রতি প্রশ্নে ঠিক ৪টি অপশন</span></div>        {examQuestions.map((question, index) => <div className="question-editor" key={index}><div className="question-title"><strong>প্রশ্ন {index + 1}</strong>{examQuestions.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setExamQuestions(examQuestions.filter((_, i) => i !== index))}>মুছুন</button>}</div><label>প্রশ্ন<input value={question.prompt} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, prompt: event.target.value } : q))} required /></label><div className="options-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<div className="option-input"><input value={option} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, options: q.options.map((value, n) => n === optionIndex ? event.target.value : value) } : q))} required /><input aria-label={`Option ${optionIndex + 1} সঠিক উত্তর`} type="radio" checked={question.correctIndex === optionIndex} onChange={() => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, correctIndex: optionIndex } : q))} /></div></label>)}</div><label>ব্যাখ্যা<textarea rows={2} maxLength={2000} value={question.explanation} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, explanation: event.target.value } : q))} placeholder="সঠিক উত্তরের কারণ লিখুন" /></label><label className="marks-input">Marks per question<input type="number" min="0.1" step="0.1" value={question.marks} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, marks: Number(event.target.value) } : q))} required /></label></div>)}<button type="button" className="secondary" onClick={() => setExamQuestions([...examQuestions, blankQuestion()])}>＋ আরেকটি প্রশ্ন যোগ করুন</button><div className="builder-footer"><span>মোট নম্বর: <strong>{formatMarks(examQuestions.reduce((sum, q) => sum + Number(q.marks || 0), 0))}</strong></span><button className="primary" disabled={busy}>পরীক্ষা তৈরি করুন</button></div></form>}<div className="panel"><h3>কোর্স বেছে নিয়ে পরীক্ষার তালিকা</h3><select value={selectedMaterialCourse} onChange={(event) => setSelectedMaterialCourse(event.target.value)}><option value="">কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select>{exams.map((exam) => <div className="course-admin" key={exam.id}><div><strong>{exam.title}</strong><p className="muted">{exam.questionCount} প্রশ্ন · {exam.durationMinutes} মিনিট · Pass mark {exam.passMark}</p></div><span className="status approved">READY</span></div>)}</div></section>}                        {user.role === "ADMIN" && tab === "Results" && <section><div className="section-heading"><div><h2>পরীক্ষার ফলাফল</h2><p className="muted">শিক্ষার্থীর প্রতিটি প্রচেষ্টার নম্বর, উত্তর ও মেধাস্থান</p></div></div><div className="results-list">{results.map((result) => <details className="result-card" key={result.id}><summary><div className="result-summary"><span className="avatar small">{result.student.name.slice(0, 1)}</span><div><strong>{result.student.name} · {result.exam.title} · প্রচেষ্টা {result.attemptNumber}</strong><small>{result.student.email ?? result.student.mobile} · {new Date(result.submittedAt).toLocaleString("bn-BD")}</small></div></div><span className={`status ${result.passed ? "approved" : "rejected"}`}>{formatMarks(result.score)}/{formatMarks(result.totalMarks)} · {result.passed ? "PASS" : "FAIL"} · মেধাস্থান {result.rank}/{result.rankTotal}</span></summary><div className="attempt-counts"><span>সঠিক নম্বর {formatMarks(result.correctMarks)}</span><span>নেগেটিভ কাটা {formatMarks(result.negativeMarksDeducted)}{result.scoreFloorApplied ? " (সর্বনিম্ন ০)" : ""}</span><span>প্রাপ্ত নম্বর {formatMarks(result.score)}/{formatMarks(result.totalMarks)}</span><span>সঠিক {result.correctCount}</span><span>ভুল {result.wrongCount}</span><span>উত্তরহীন {result.unansweredCount}</span></div><div className="answer-review">{result.details.map((answer, i) => <div key={i}><strong>{i + 1}. {answer.prompt}</strong><p className={answer.isCorrect ? "correct-answer" : "wrong-answer"}>শিক্ষার্থীর উত্তর: {answer.chosen} {answer.isCorrect ? "✓" : "✗"} · প্রাপ্ত {formatMarks(answer.earnedMarks)}/{formatMarks(answer.marks)}</p>{!answer.isCorrect && <p className="correct-answer">সঠিক উত্তর: {answer.correct}</p>}{answer.explanation && <p className="answer-explanation"><strong>ব্যাখ্যা:</strong> {answer.explanation}</p>}</div>)}</div></details>)}{!results.length && <Empty text="এখনও পরীক্ষার ফল নেই।" />}</div></section>}

        {user.role === "STUDENT" && tab === "Course Catalog" && <section><div className="welcome-row"><div><span className="eyebrow">আপনার শেখার যাত্রা</span><h2>আপনার পরবর্তী কোর্সটি খুঁজুন</h2><p className="muted">পছন্দের কোর্স বেছে নিয়ে এনরোলমেন্ট রিকোয়েস্ট করুন।</p></div></div><div className="course-grid">{courses.map((course, index) => {
          const enrollment = enrollments.find((item) => typeof item.course === "object" && "_id" in item.course && item.course._id === course._id);
          return <article className="course-card" key={course._id}><div className={`course-art art-${index % 4}`} style={course.coverImage ? { backgroundImage: `linear-gradient(rgba(14,32,28,.2),rgba(14,32,28,.2)),url("${course.coverImage}")` } : undefined}><span>আপনার কোর্স</span><span className="art-symbol">{["◈", "▤", "⌘", "✦"][index % 4]}</span></div><div className="course-card-content"><div className="course-meta"><span>কোর্স ফি</span><strong>{money(course.fee)}</strong></div><h3>{course.title}</h3><p>{course.description}</p><div className="course-card-footer">{enrollment ? <StatusPill status={enrollment.status} /> : <button className="primary" onClick={() => setPaymentCourse(course)}>কোর্সে ভর্তি হন <span>→</span></button>}<span className="course-link" aria-hidden="true">↗</span></div></div></article>;
        })}{!courses.length && <Empty text="এখনও কোনো কোর্স প্রকাশিত হয়নি।" />}</div></section>}
        {user.role === "STUDENT" && tab === "My Enrollments" && <section><div className="section-heading"><div><h2>আমার এনরোলমেন্ট</h2><p className="muted">পেমেন্ট যাচাই ও কোর্স অ্যাক্সেসের অবস্থা।</p></div></div><div className="enrollment-grid">{enrollments.map((item, index) => <article className={`enrollment-card enrollment-tone-${index % 4}`} key={item._id}><div className="enrollment-card-heading"><span className="enrollment-course-icon" aria-hidden="true">▤</span><div><small>কোর্স</small><h3>{paymentCourseName(item)}</h3></div><StatusPill status={item.status} /></div><div className="enrollment-card-details"><div><span>Transaction ID</span><strong className="mono">{item.transactionId}</strong></div><div><span>পেমেন্ট মাধ্যম</span><strong>{item.paymentMethod === "BKASH" ? "বিকাশ" : item.paymentMethod === "NAGAD" ? "নগদ" : item.paymentMethod}</strong></div><div><span>প্রেরকের নম্বর</span><strong>{item.senderMobile}</strong></div></div><p className={`enrollment-note ${item.status === "REJECTED" ? "rejected" : item.status === "APPROVED" ? "approved" : "pending"}`}>{item.status === "REJECTED" ? item.rejectionReason || "পেমেন্ট রিকোয়েস্টটি প্রত্যাখ্যান করা হয়েছে।" : item.status === "APPROVED" ? "আপনার কোর্স অ্যাক্সেস চালু হয়েছে।" : "আপনার পেমেন্ট তথ্য যাচাই করা হচ্ছে।"}</p></article>)}{!enrollments.length && <div className="enrollment-empty"><Empty text="আপনি এখনও কোনো কোর্সে ভর্তি হননি। কোর্স তালিকা থেকে পছন্দের কোর্স বেছে নিন।" /></div>}</div></section>}
        {user.role === "STUDENT" && tab === "Study Materials" && <section><div className="section-heading"><div><h2>স্টাডি ম্যাটেরিয়াল</h2><p className="muted">অনুমোদিত কোর্সের পাঠ্য উপকরণ।</p></div></div><CourseSelector courses={courses} enrollments={enrollments} value={selectedMaterialCourse} onChange={setSelectedMaterialCourse} /><MaterialList materials={materials} /></section>}
        {user.role === "STUDENT" && tab === "Exams" && <section>
          {examTaking ? <div className="panel exam-taking">
            <div className="exam-live-header"><div><span className="eyebrow">পরীক্ষা চলছে</span><h2>{examTaking.title}</h2></div><div className={`exam-countdown${remainingSeconds < 60 ? " urgent" : ""}`} role="timer" aria-live="polite"><small>সময় বাকি</small><strong>{String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}</strong></div></div>
            <div className="exam-question-progress">
              <div className="exam-progress-bar"><span>{answers.filter((answer) => answer >= 0).length}/{answers.length} উত্তর দেওয়া</span><span>{answers.filter((answer) => answer < 0).length} বাকি</span><i><b style={{ width: `${answers.filter((answer) => answer >= 0).length / Math.max(answers.length, 1) * 100}%` }} /></i></div>
              <nav className="question-nav" aria-label="প্রশ্নে যান">{examTaking.questions.map((_, index) => <button key={index} type="button" className={`${index === currentQuestion ? "current" : ""} ${answers[index] >= 0 ? "answered" : "unanswered"}`} aria-current={index === currentQuestion ? "step" : undefined} aria-label={`প্রশ্ন ${index + 1}${answers[index] >= 0 ? ", উত্তর দেওয়া হয়েছে" : ", উত্তর বাকি"}`} onClick={() => document.getElementById(`exam-question-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</nav>
              <div className="question-nav-legend"><span><i /> উত্তর দেওয়া হয়েছে</span><span>{answers.filter((answer) => answer < 0).length}টি উত্তর বাকি</span></div>
              <p className="question-nav-hint">যেকোনো প্রশ্নে যেতে নিচে স্ক্রল করুন, অথবা প্রশ্ন নম্বরে চাপুন।</p>
            </div>
            <div className="exam-question-list" ref={examQuestionList}>{examTaking.questions.map((question, index) => <article className={`take-question${answers[index] >= 0 ? " answered" : ""}`} id={`exam-question-${index}`} data-question-index={index} key={index}>
              <h3><span className="take-question-number">{String(index + 1).padStart(2, "0")}</span><span className="take-question-prompt">{question.prompt}</span><span className="take-question-marks">{question.marks} নম্বর</span></h3>
              <div className="take-question-options">{question.options.map((option, optionIndex) => <label className={`answer-option ${answers[index] === optionIndex ? "chosen" : ""}`} key={optionIndex}><input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers(answers.map((answer, answerIndex) => answerIndex === index ? optionIndex : answer))} /><span className="answer-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span></label>)}</div>
              {answers[index] < 0 && <span className="question-unanswered-label">এখনও উত্তর দেওয়া হয়নি</span>}
            </article>)}</div>
            <div className="exam-submit-bar"><div><strong>{answers.filter((answer) => answer >= 0).length} / {answers.length}</strong><span>{answers.filter((answer) => answer < 0).length}টি প্রশ্নের উত্তর বাকি</span></div><button className="primary" disabled={isSubmittingExam} onClick={() => void submitExam()}>{isSubmittingExam ? "জমা হচ্ছে..." : "পরীক্ষা জমা দিন"}</button></div>
          </div> : <>
            <div className="section-heading"><div><h2>MCQ পরীক্ষা</h2><p className="muted">প্রকাশিত পরীক্ষায় অংশ নিতে অনুমোদিত কোর্স নির্বাচন করুন।</p></div></div>
            <CourseSelector courses={courses} enrollments={enrollments} value={selectedMaterialCourse} onChange={setSelectedMaterialCourse} />
            {exams.map((exam) => <article className="exam-card" key={exam.id}>
              <div className="exam-icon">▣</div>
              <div className="exam-info"><strong>{exam.title}</strong><p>{exam.questionCount}টি প্রশ্ন · {exam.durationMinutes} মিনিট · পাস নম্বর {exam.passMark}</p><small>পরীক্ষার সময়: {new Date(exam.startsAt).toLocaleString("bn-BD")} – {new Date(exam.endsAt).toLocaleString("bn-BD")}</small></div>
              <div className="student-result"><p className="exam-policy">মেধাতালিকা: {exam.leaderboardRule === "FIRST" ? "প্রথম প্রচেষ্টা" : exam.leaderboardRule === "LATEST" ? "সর্বশেষ প্রচেষ্টা" : "সর্বোচ্চ নম্বর"}{exam.negativeMarkingEnabled ? ` · ভুল উত্তরে -${exam.negativeMarks}` : " · নেগেটিভ মার্কিং নেই"}</p>{exam.results.length > 0 && <ExamAttemptHistory exam={exam} />}<button className="primary" onClick={() => startExam(exam)}>{exam.results.length ? "আবার পরীক্ষা দিন →" : "পরীক্ষা শুরু করুন →"}</button></div>
            </article>)}
            {selectedMaterialCourse && exams.length === 0 && <Empty text="এই কোর্সে এখন কোনো পরীক্ষা নেই।" />}
          </>}
        </section>}
        </>}
      </div>
    </main>
    {paymentCourse && <div className="modal-backdrop" onClick={() => setPaymentCourse(null)}><section className="modal" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">ENROLLMENT REQUEST</span><h2>পেমেন্ট তথ্য জমা দিন</h2></div><button className="icon-button" onClick={() => setPaymentCourse(null)}>×</button></div><div className="payment-course"><strong>{paymentCourse.title}</strong><span>{money(paymentCourse.fee)}</span></div><p className="instruction">{paymentCourse.paymentInstructions}</p><form className="stack-form" onSubmit={(event) => submitForm(event, submitPayment)}><label>Payment Method<select name="paymentMethod"><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option></select></label><label>Transaction ID<input name="transactionId" placeholder="যেমন: 8F72K9A1" required minLength={5} maxLength={40} /></label><label>Sender Mobile Number<input name="senderMobile" placeholder="01XXXXXXXXX" required /></label><p className="warning-note">এটি একটি UI-ভিত্তিক তথ্য জমা। এই ফর্মে প্রকৃত পেমেন্ট বা স্বয়ংক্রিয় যাচাই হচ্ছে না। Admin অনুমোদন না দেওয়া পর্যন্ত কোর্স আনলক হবে না।</p><button className="primary wide" disabled={busy}>পেমেন্ট রিকোয়েস্ট জমা দিন</button></form></section></div>}
    {editingCourse && <div className="modal-backdrop" onClick={() => setEditingCourse(null)}><section className="modal" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">COURSE MANAGEMENT</span><h2>কোর্স সম্পাদনা</h2></div><button className="icon-button" onClick={() => setEditingCourse(null)}>×</button></div><form className="stack-form" onSubmit={(event) => submitForm(event, saveCourse)}><label>কোর্সের নাম<input name="title" defaultValue={editingCourse.title} required /></label><label>বিবরণ<textarea name="description" rows={3} defaultValue={editingCourse.description} required /></label><label>কোর্স ফি (৳)<input name="fee" type="number" min="0" defaultValue={editingCourse.fee} required /></label><label>পেমেন্ট নির্দেশনা<textarea name="paymentInstructions" rows={2} defaultValue={editingCourse.paymentInstructions} required /></label><div className="edit-course-cover"><strong>কোর্সের কভার ছবি</strong>{(coverImagePreview || (!coverImageRemoved && coverImageUrl)) && <img src={coverImagePreview || coverImageUrl} alt="কোর্স কভার প্রিভিউ" />}<label className="cover-upload">ছবি নির্বাচন করুন<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runAction(async () => { setCoverImageFile(await compressCourseImage(file)); setCoverImageRemoved(false); }); }} /></label>{(coverImageFile || coverImageUrl) && <button className="text-button danger-text" type="button" onClick={() => { setCoverImageFile(null); setCoverImageRemoved(true); }}>ছবি সরান</button>}<small>ছবির ফাইল MongoDB GridFS-এ থাকবে; course record-এ এর URL রাখা হবে।</small></div><label className="check-label"><input type="checkbox" name="published" defaultChecked={editingCourse.published} /> কোর্স প্রকাশ করুন</label><button className="primary" disabled={busy}>পরিবর্তন সংরক্ষণ</button></form></section></div>}
    {rejectionTarget && <div className="modal-backdrop" onClick={() => { if (!busy) setRejectionTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="reject-payment-title" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">পেমেন্ট যাচাই</span><h2 id="reject-payment-title">প্রত্যাখ্যানের কারণ</h2></div><button className="icon-button" type="button" aria-label="বন্ধ করুন" disabled={busy} onClick={() => setRejectionTarget(null)}>×</button></div><p className="muted">কারণটি শিক্ষার্থীকে দেখানো হবে, যাতে প্রয়োজন হলে সঠিক তথ্য দিয়ে আবার আবেদন করতে পারেন।</p>{error && <p className="alert error" role="alert" aria-live="assertive">{error}</p>}<form className="stack-form" onSubmit={(event) => submitForm(event, rejectPayment)}><label htmlFor="rejection-reason">প্রত্যাখ্যানের কারণ<textarea id="rejection-reason" name="rejectionReason" rows={4} required autoFocus placeholder="যেমন: Transaction ID যাচাই করা যায়নি।" /></label><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={() => setRejectionTarget(null)}>বাতিল</button><button type="submit" className="reject-button" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে…" : "প্রত্যাখ্যান নিশ্চিত করুন"}</button></div></form></section></div>}
  </div>;
}

function icon(label: string) {
  const symbols: Record<string, string> = { Dashboard: "▦", Students: "♧", "Payment Requests": "৳", Courses: "▤", "Study Materials": "▧", "MCQ Exam Builder": "☷", Results: "▥", "Course Catalog": "⌕", "My Enrollments": "▣", Exams: "▤" };
  return symbols[label] ?? "◦";
}

function navigationLabel(label: string) {
  const labels: Record<string, string> = {
    Dashboard: "ড্যাশবোর্ড",
    Students: "শিক্ষার্থী",
    "Payment Requests": "পেমেন্ট রিকোয়েস্ট",
    Courses: "কোর্স",
    "Study Materials": "স্টাডি ম্যাটেরিয়াল",
    "MCQ Exam Builder": "পরীক্ষা তৈরি",
    Results: "ফলাফল",
    "Course Catalog": "কোর্স তালিকা",
    "My Enrollments": "আমার এনরোলমেন্ট",
    Exams: "পরীক্ষা"
  };
  return labels[label] ?? label;
}

function AdminResultsPanel({ results, onRefresh }: { results: ResultRow[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "PASSED" | "FAILED">("ALL");
  const examTitles = [...new Set(results.map((result) => result.exam.title))].sort((left, right) => left.localeCompare(right));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredResults = results.filter((result) => {
    const matchesSearch = !normalizedSearch || [result.student.name, result.student.email, result.student.mobile, result.exam.title]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
    const matchesExam = !examFilter || result.exam.title === examFilter;
    const matchesOutcome = outcomeFilter === "ALL" || (outcomeFilter === "PASSED" ? result.passed : !result.passed);
    return matchesSearch && matchesExam && matchesOutcome;
  });
  const participantCount = new Set(results.map((result) => `${result.exam.title}:${result.student.email ?? result.student.mobile ?? result.student.name}`)).size;
  const passedCount = results.filter((result) => result.passed).length;
  const failedCount = results.length - passedCount;
  const averagePercent = results.length
    ? results.reduce((sum, result) => sum + (result.totalMarks > 0 ? result.score / result.totalMarks * 100 : 0), 0) / results.length
    : 0;
  const hasFilters = Boolean(search || examFilter || outcomeFilter !== "ALL");

  function clearFilters() {
    setSearch("");
    setExamFilter("");
    setOutcomeFilter("ALL");
  }

  return <section className="admin-results">
    <div className="admin-results-heading">
      <div><span className="eyebrow">PERFORMANCE OVERVIEW</span><h2>পরীক্ষার ফলাফল</h2><p>শিক্ষার্থীদের স্কোর, উত্তর ও মেধাস্থান এক জায়গায় দেখুন।</p></div>
      <button className="secondary admin-results-refresh" type="button" onClick={() => void onRefresh()}>↻ &nbsp;Refresh results</button>
    </div>
    <div className="admin-results-stats">
      <div><span>মোট প্রচেষ্টা</span><strong>{results.length.toLocaleString("bn-BD")}</strong><small>সব পরীক্ষার জমা</small></div>
      <div><span>অংশগ্রহণকারী</span><strong>{participantCount.toLocaleString("bn-BD")}</strong><small>পরীক্ষাভিত্তিক শিক্ষার্থী</small></div>
      <div><span>উত্তীর্ণ</span><strong className="result-stat-pass">{passedCount.toLocaleString("bn-BD")}</strong><small>পাস করা প্রচেষ্টা</small></div>
      <div><span>অনুত্তীর্ণ</span><strong className="result-stat-fail">{failedCount.toLocaleString("bn-BD")}</strong><small>পাস না করা প্রচেষ্টা</small></div>
      <div><span>গড় স্কোর</span><strong>{formatMarks(averagePercent)}%</strong><small>মোট নম্বরের তুলনায়</small></div>
    </div>
    <div className="admin-results-toolbar">
      <label className="admin-results-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="শিক্ষার্থী, ইমেইল বা পরীক্ষা খুঁজুন" aria-label="শিক্ষার্থী, ইমেইল বা পরীক্ষা খুঁজুন" /></label>
      <label>পরীক্ষা<select value={examFilter} onChange={(event) => setExamFilter(event.target.value)}><option value="">সব পরীক্ষা</option>{examTitles.map((exam) => <option value={exam} key={exam}>{exam}</option>)}</select></label>
      <label>ফলাফল<select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as typeof outcomeFilter)}><option value="ALL">সব ফলাফল</option><option value="PASSED">উত্তীর্ণ</option><option value="FAILED">অনুত্তীর্ণ</option></select></label>
      {hasFilters && <button className="text-button admin-results-clear" type="button" onClick={clearFilters}>ফিল্টার মুছুন</button>}
      <span className="admin-results-count">{filteredResults.length.toLocaleString("bn-BD")} / {results.length.toLocaleString("bn-BD")} ফলাফল</span>
    </div>
    <div className="admin-results-list">
      {filteredResults.map((result) => <details className="admin-result-card" key={result.id}>
        <summary>
          <span className="avatar small admin-result-avatar">{result.student.name.slice(0, 1).toUpperCase()}</span>
          <span className="admin-result-identity"><strong>{result.student.name}</strong><small>{result.student.email ?? result.student.mobile ?? "যোগাযোগের তথ্য নেই"}</small><span>{result.exam.title} · প্রচেষ্টা {result.attemptNumber} · {new Date(result.submittedAt).toLocaleString("bn-BD")}</span></span>
          <span className="admin-result-score"><strong>{formatMarks(result.score)} <small>/ {formatMarks(result.totalMarks)}</small></strong><span className={`status ${result.passed ? "approved" : "rejected"}`}>{result.passed ? "উত্তীর্ণ" : "অনুত্তীর্ণ"}</span></span>
          <span className="admin-result-rank"><small>মেধাস্থান</small><strong>{result.rank.toLocaleString("bn-BD")}<span> / {result.rankTotal.toLocaleString("bn-BD")}</span></strong></span>
          <span className="admin-result-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="admin-result-details">
          <div className="admin-result-metrics">
            <div><span>সঠিক উত্তরের নম্বর</span><strong>{formatMarks(result.correctMarks)}</strong></div>
            <div><span>নেগেটিভ কাটা</span><strong className={result.negativeMarksDeducted ? "deducted-marks" : ""}>{formatMarks(result.negativeMarksDeducted)}{result.scoreFloorApplied && <small> · সর্বনিম্ন ০</small>}</strong></div>
            <div><span>সঠিক উত্তর</span><strong>{result.correctCount}</strong></div>
            <div><span>ভুল উত্তর</span><strong>{result.wrongCount}</strong></div>
            <div><span>উত্তরহীন</span><strong>{result.unansweredCount}</strong></div>
          </div>
          <h3 className="admin-answer-heading">উত্তর পর্যালোচনা <span>{result.details.length}টি প্রশ্ন</span></h3>
          <div className="admin-answer-list">{result.details.map((answer, index) => <article className={`admin-answer-card ${answer.isCorrect ? "correct" : answer.chosen === "উত্তর দেননি" ? "unanswered" : "incorrect"}`} key={`${result.id}-${index}`}>
            <div className="admin-answer-title"><span>{String(index + 1).padStart(2, "0")}</span><strong>{answer.prompt}</strong><b>{formatMarks(answer.earnedMarks)} / {formatMarks(answer.marks)}</b></div>
            <p className={answer.isCorrect ? "correct-answer" : answer.chosen === "উত্তর দেননি" ? "admin-answer-unanswered" : "wrong-answer"}>শিক্ষার্থীর উত্তর: {answer.chosen || "উত্তর দেননি"} {answer.isCorrect ? "✓" : answer.chosen === "উত্তর দেননি" ? "—" : "✗"}</p>
            {!answer.isCorrect && <p className="correct-answer">সঠিক উত্তর: {answer.correct}</p>}
            {answer.explanation && <p className="answer-explanation"><strong>ব্যাখ্যা:</strong> {answer.explanation}</p>}
          </article>)}</div>
        </div>
      </details>)}
      {!filteredResults.length && <div className="admin-results-empty"><span>⌕</span><strong>{results.length ? "কোনো ফলাফল মেলেনি" : "এখনও পরীক্ষার ফল নেই"}</strong><p>{results.length ? "অন্য নাম, পরীক্ষা বা ফলাফলের ফিল্টার দিয়ে চেষ্টা করুন।" : "শিক্ষার্থীরা পরীক্ষা জমা দিলে ফলাফল এখানে দেখা যাবে।"}</p>{hasFilters && <button className="secondary" type="button" onClick={clearFilters}>সব ফলাফল দেখুন</button>}</div>}
    </div>
  </section>;
}

function LandingPage({ courses, error, onLogin, onRegister }: { courses: Course[]; error: string; onLogin: () => void; onRegister: () => void }) {
  return <main className="landing-page">
    {error && <p className="landing-error" role="alert">{error}</p>}
    <header className="landing-header">
      <a className="brand" href="#home"><span className="brand-mark">E</span><span>EduPrepX<small>LEARNING PLATFORM</small></span></a>
      <nav aria-label="প্রধান নেভিগেশন"><a href="#courses">কোর্স</a><a href="#features">সুবিধাসমূহ</a><a href="#how-it-works">যেভাবে কাজ করে</a></nav>
      <div className="landing-header-actions"><button className="landing-login" onClick={onLogin}>লগইন</button><button className="primary" onClick={onRegister}>শুরু করুন <span>→</span></button></div>
    </header>
    <section className="landing-hero" id="home">
      <div className="landing-hero-copy">
        <span className="landing-kicker"><i /> শেখা, অনুশীলন, সাফল্য</span>
        <h1>আপনার লক্ষ্যে পৌঁছান<br /><em>পরিকল্পিত প্রস্তুতিতে</em></h1>
        <p>গুছানো কোর্স, নির্ভরযোগ্য স্টাডি ম্যাটেরিয়াল এবং সময়ভিত্তিক MCQ পরীক্ষায় প্রস্তুতিকে এগিয়ে নিন—একটি প্ল্যাটফর্মেই।</p>
        <div className="landing-hero-actions"><button className="primary landing-cta" onClick={onRegister}>শিক্ষার্থী হিসেবে যোগ দিন <span>→</span></button><a className="landing-secondary-link" href="#courses">কোর্স দেখুন <span>↓</span></a></div>
        <div className="landing-trust"><span className="landing-trust-mark">✓</span><span>পেমেন্ট যাচাইয়ের পরেই কোর্স অ্যাক্সেস</span></div>
      </div>
      <div className="landing-visual" aria-label="অনলাইন পরীক্ষার ড্যাশবোর্ডের নমুনা">
        <div className="landing-visual-orbit orbit-one" /><div className="landing-visual-orbit orbit-two" />
        <div className="landing-preview-card">
          <div className="preview-top"><span><i /> LIVE PRACTICE</span><span className="preview-dots">•••</span></div>
          <p className="preview-label">আজকের অনুশীলন</p><h3>MCQ প্রস্তুতি পরীক্ষা</h3>
          <div className="preview-progress"><div><span>আপনার অগ্রগতি</span><strong>৭৫%</strong></div><i><b /></i></div>
          <div className="preview-question"><span>প্রশ্ন ০৮ / ১২</span><strong>কোন ডেটা স্ট্রাকচার LIFO নীতি অনুসরণ করে?</strong>
            <div className="preview-option"><i>ক</i> Queue</div><div className="preview-option selected"><i>খ</i> Stack <b>✓</b></div>
          </div>
          <div className="preview-footer"><span>⏱ &nbsp;১২:৪৮ বাকি</span><button type="button">পরবর্তী →</button></div>
        </div>
        <div className="preview-float"><span>✓</span><div><strong>প্রস্তুতি হোক নিয়মিত</strong><small>এক ধাপ করে লক্ষ্যের পথে</small></div></div>
      </div>
    </section>
    <section className="landing-benefits" id="features">
      <div className="landing-section-heading"><span className="eyebrow">এক প্ল্যাটফর্মে পূর্ণ প্রস্তুতি</span><h2>শেখা থেকে পরীক্ষা—সবকিছু গুছিয়ে</h2><p>আপনার পড়াশোনার প্রতিটি ধাপ সহজ ও কার্যকর করতে প্রয়োজনীয় টুলস।</p></div>
      <div className="landing-feature-grid">
        <article className="landing-feature"><span className="landing-feature-icon">▤</span><h3>কোর্সভিত্তিক শেখা</h3><p>লক্ষ্য অনুযায়ী কোর্স বেছে নিন এবং আপনার শেখার অগ্রগতি এক জায়গায় রাখুন।</p></article>
        <article className="landing-feature"><span className="landing-feature-icon">▧</span><h3>গুছানো স্টাডি ম্যাটেরিয়াল</h3><p>অনুমোদিত কোর্সের নোট ও শিক্ষাসামগ্রী সহজে খুঁজে পড়ুন।</p></article>
        <article className="landing-feature"><span className="landing-feature-icon">☷</span><h3>সময়ভিত্তিক MCQ পরীক্ষা</h3><p>সময়সীমার মধ্যে পরীক্ষা দিন, ফলাফল দেখুন এবং প্রতিটি উত্তরের সঠিক সমাধান জানুন।</p></article>
        <article className="landing-feature"><span className="landing-feature-icon">৳</span><h3>নিরাপদ এনরোলমেন্ট</h3><p>পেমেন্ট তথ্য জমা দিন; Admin যাচাই ও অনুমোদনের পর কোর্স অ্যাক্সেস চালু হবে।</p></article>
      </div>
    </section>
    <section className="landing-courses" id="courses">
      <div className="landing-section-heading landing-course-heading"><div><span className="eyebrow">আপনার পরবর্তী ধাপ</span><h2>জনপ্রিয় কোর্সসমূহ</h2><p>আপনার প্রস্তুতির সঙ্গে মানানসই কোর্সটি খুঁজে নিন।</p></div><button className="landing-text-link" onClick={onRegister}>সব কোর্স দেখুন →</button></div>
      {courses.length ? <div className="landing-course-grid">{courses.slice(0, 3).map((course, index) => <article className="landing-course-card" key={course._id}>
        <div className={`landing-course-art landing-art-${index % 3}`} style={course.coverImage ? { backgroundImage: `linear-gradient(rgba(14,32,28,.2),rgba(14,32,28,.2)),url("${course.coverImage}")` } : undefined}><span>EDUPREPX COURSE</span><strong>{["01", "02", "03"][index]}</strong></div>
        <div className="landing-course-copy"><span className="landing-course-tag">কোর্স</span><h3>{course.title}</h3><p>{course.description}</p><div><strong>৳{Number(course.fee).toLocaleString("bn-BD")}</strong><button onClick={onRegister}>বিস্তারিত <span>→</span></button></div></div>
      </article>)}</div> : <div className="landing-empty-courses"><span>▤</span><p>কোর্সগুলো শিগগিরই এখানে প্রকাশিত হবে।</p><button className="landing-text-link" onClick={onRegister}>শিক্ষার্থী অ্যাকাউন্ট তৈরি করুন →</button></div>}
    </section>
    <section className="landing-steps" id="how-it-works">
      <div className="landing-section-heading"><span className="eyebrow">শুরু করা সহজ</span><h2>মাত্র তিনটি ধাপে প্রস্তুতি শুরু</h2></div>
      <div className="landing-step-grid"><article><span>১</span><div><h3>অ্যাকাউন্ট খুলুন</h3><p>ইমেইল দিয়ে নিবন্ধন করে OTP যাচাই সম্পন্ন করুন।</p></div></article><article><span>২</span><div><h3>কোর্স বেছে নিন</h3><p>পছন্দের কোর্সে এনরোলমেন্ট ও পেমেন্ট তথ্য জমা দিন।</p></div></article><article><span>৩</span><div><h3>অনুমোদন পেয়ে শিখুন</h3><p>Admin অনুমোদনের পর কোর্সের উপকরণ ও পরীক্ষায় প্রবেশ করুন।</p></div></article></div>
    </section>
    <section className="landing-final-cta"><div><span className="eyebrow">আজই শুরু করুন</span><h2>আপনার সাফল্যের প্রস্তুতি<br />শুরু হোক এখান থেকে।</h2></div><button className="landing-cta" onClick={onRegister}>শিক্ষার্থী হিসেবে নিবন্ধন <span>→</span></button></section>
    <footer className="landing-footer"><a className="brand" href="#home"><span className="brand-mark">E</span><span>EduPrepX</span></a><span>শিখুন • অনুশীলন করুন • এগিয়ে যান</span>{whatsappDigits ? <a className="whatsapp-link" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">WhatsApp-এ যোগাযোগ · {whatsappNumber}</a> : <span className="whatsapp-link">WhatsApp যোগাযোগের নম্বর শিগগিরই যোগ হবে</span>}<span>© {new Date().getFullYear()} EduPrepX</span></footer>
  </main>;
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { PENDING: "অপেক্ষমাণ", APPROVED: "অনুমোদিত", REJECTED: "প্রত্যাখ্যাত" };
  return <span className={`status ${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><span>◇</span><p>{text}</p></div>;
}

function PaymentTable({ requests, decide, isAdmin }: { requests: Enrollment[]; decide: (enrollment: Enrollment, status: "APPROVED" | "REJECTED") => void; isAdmin?: boolean }) {
  return <div className={`table-wrap${isAdmin ? " admin-mobile-cards" : ""}`}><table><thead><tr><th>শিক্ষার্থী</th><th>কোর্স</th><th>পেমেন্টের তথ্য</th><th>Transaction ID</th><th>অবস্থা</th>{isAdmin && <th>সিদ্ধান্ত</th>}</tr></thead><tbody>{requests.map((request) => <tr key={request._id}><td data-label="শিক্ষার্থী">{request.student?.name ?? "—"}<small className="block muted">{request.student?.email ?? request.student?.mobile}</small></td><td data-label="কোর্স">{typeof request.course === "object" ? request.course.title : "—"}</td><td data-label="পেমেন্টের তথ্য">{request.paymentMethod}<small className="block muted">{request.senderMobile}</small></td><td data-label="Transaction ID" className="mono">{request.transactionId}</td><td data-label="অবস্থা"><StatusPill status={request.status} /></td>{isAdmin && <td data-label="সিদ্ধান্ত">{request.status === "PENDING" ? <div className="action-row"><button className="approve-button" onClick={() => decide(request, "APPROVED")}>অনুমোদন</button><button className="reject-button" onClick={() => decide(request, "REJECTED")}>প্রত্যাখ্যান</button></div> : <span className="muted">পর্যালোচনা সম্পন্ন</span>}</td>}</tr>)}</tbody></table>{requests.length === 0 && <Empty text="কোনো পেমেন্ট রিকোয়েস্ট নেই।" />}</div>;
}

function CourseSelector({ courses, enrollments, value, onChange }: { courses: Course[]; enrollments: Enrollment[]; value: string; onChange: (value: string) => void }) {
  const allowed = courses.filter((course) => enrollments.some((item) => item.status === "APPROVED" && typeof item.course === "object" && "_id" in item.course && item.course._id === course._id));
  return <div className="selector-row"><label>অনুমোদিত কোর্স নির্বাচন করুন<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">কোর্স নির্বাচন করুন</option>{allowed.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label>{!allowed.length && <span className="muted">কোর্স অ্যাক্সেসের জন্য Admin অনুমোদন প্রয়োজন।</span>}</div>;
}

function MaterialList({ materials }: { materials: Material[] }) {
  return <div className="material-list">{materials.map((material) => <a className="material-item" key={material._id} href={material.url} target="_blank" rel="noreferrer"><span className="material-icon">{material.kind === "PDF" ? "PDF" : "↗"}</span><span><strong>{material.title}</strong><small>{material.description || material.kind}</small></span><b>↗</b></a>)}{materials.length === 0 && <Empty text="কোনো উপকরণ যোগ করা হয়নি বা কোর্স নির্বাচন করা হয়নি।" />}</div>;
}

function ExamAnswerDetails({ details }: { details: ExamAnswerDetail[] }) {
  return <div className="exam-result-details">{details.map((answer, index) => <div className={`exam-answer-detail ${answer.isCorrect ? "correct" : "incorrect"}`} key={index}>
      <strong>{index + 1}. {answer.prompt}</strong>
      <div className="exam-review-options">{answer.options.map((option, optionIndex) => {
        const isChosen = optionIndex === answer.chosenIndex;
        const isCorrect = optionIndex === answer.correctIndex;
        return <div className={`exam-review-option${isChosen ? " chosen" : ""}${isCorrect ? " correct-answer" : ""}`} key={optionIndex}>
          <span>{String.fromCharCode(65 + optionIndex)}. {option}</span>
          <span className="exam-review-labels">
            {isChosen && <b className="chosen-label">আপনার উত্তর</b>}
            {isCorrect && <b className="correct-label">সঠিক উত্তর</b>}
          </span>
        </div>;
      })}</div>
      {answer.chosenIndex === null && <p className="exam-unanswered">আপনি এই প্রশ্নের উত্তর দেননি।</p>}
      <small>প্রাপ্ত নম্বর: {answer.earnedMarks}/{answer.marks}</small>
      {answer.explanation && <p className="answer-explanation"><strong>ব্যাখ্যা:</strong> {answer.explanation}</p>}
    </div>)}</div>;
}

function ExamAttemptHistory({ exam }: { exam: Exam }) {
  return <div className="attempt-history">
    <h3>আপনার ফলাফল</h3>
    <div className="attempt-history-list">{exam.results.map((result) => <details className="exam-result-detail" key={result.attemptNumber}>
      <summary><span><b>প্রচেষ্টা {result.attemptNumber}</b><span className="attempt-summary-score">{formatMarks(result.score)} / {formatMarks(result.totalMarks)}</span></span><small>{new Date(result.submittedAt).toLocaleString("bn-BD")}</small></summary>
      <div className="attempt-result-meta"><span className={`status ${result.passed ? "approved" : "rejected"}`}>{result.passed ? "উত্তীর্ণ" : "অনুত্তীর্ণ"}</span><span className="attempt-rank">মেধাস্থান <strong>{result.rank}</strong> / {result.rankTotal}</span></div>
      <div className="attempt-counts"><div><span>সঠিক নম্বর</span><strong>{formatMarks(result.correctMarks)}</strong></div><div><span>নেগেটিভ কাটা</span><strong className={result.negativeMarksDeducted ? "deducted-marks" : ""}>{formatMarks(result.negativeMarksDeducted)}{result.scoreFloorApplied && <small> সর্বনিম্ন ০</small>}</strong></div><div><span>সঠিক উত্তর</span><strong>{result.correctCount}</strong></div><div><span>ভুল উত্তর</span><strong>{result.wrongCount}</strong></div><div><span>উত্তরহীন</span><strong>{result.unansweredCount}</strong></div></div>
      <ExamAnswerDetails details={result.details} />
    </details>)}</div>
    <details className="exam-result-detail leaderboard-detail">
      <summary><span><strong>সকল শিক্ষার্থীর মেধাতালিকা</strong><small>{exam.leaderboardRule === "FIRST" ? "প্রথম প্রচেষ্টা" : exam.leaderboardRule === "LATEST" ? "সর্বশেষ প্রচেষ্টা" : "সর্বোচ্চ নম্বর"} · {exam.leaderboard.length} জন</small></span><span className="leaderboard-expand">তালিকা দেখুন <b aria-hidden="true">⌄</b></span></summary>
      {exam.leaderboard.length ? <ol className="leaderboard-list">{exam.leaderboard.map((entry) => <li className={entry.isCurrentStudent ? "current-student" : ""} key={`${entry.rank}-${entry.name}`}><span className="leaderboard-rank">{entry.rank}</span><span className="leaderboard-name">{entry.name}{entry.isCurrentStudent && <small>আপনি</small>}</span><strong>{formatMarks(entry.score)}<small> / {formatMarks(entry.totalMarks)}</small></strong></li>)}</ol> : <p className="muted">এখনও কোনো ফলাফল নেই।</p>}
    </details>
  </div>;
}

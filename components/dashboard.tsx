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

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "01825261654";
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
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const submittingExam = useRef(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialKind, setMaterialKind] = useState("PDF");
  const materialFileInput = useRef<HTMLInputElement>(null);
  const [selectedMaterialCourse, setSelectedMaterialCourse] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [adminStats, setAdminStats] = useState({ students: 0, pendingPayments: 0, courses: 0, exams: 0 });
  const [requests, setRequests] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Array<{ _id: string; name: string; email?: string; mobile?: string; active: boolean; createdAt: string; enrollments: number; results: number }>>([]);
  const [results, setResults] = useState<ResultRow[]>([]);

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
      .catch((cause: Error) => setError(cause.message));
  }, [loadBase]);

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
    if (!window.confirm("আপনি কি EduPrepX থেকে লগআউট করতে চান?")) return;
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setShowAuth(false);
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
    const rejectionReason = status === "REJECTED" ? window.prompt("প্রত্যাখ্যানের কারণ লিখুন")?.trim() : "";
    if (status === "REJECTED" && !rejectionReason) return;
    try {
      await api(`/api/admin/payment-requests/${enrollment._id}`, { method: "PATCH", body: JSON.stringify({ status, rejectionReason }) });
      setMessage(status === "APPROVED" ? "পেমেন্ট অনুমোদিত হয়েছে।" : "পেমেন্ট প্রত্যাখ্যান হয়েছে।");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "সিদ্ধান্ত সংরক্ষণ করা যায়নি।"); }
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

  async function submitExam() {
    if (!examTaking || submittingExam.current) return;
    submittingExam.current = true;
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
    }
  }

  useEffect(() => {
    if (!examTaking) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((new Date(examTaking.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) void submitExam();
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [examTaking, answers]);

  const navItems = user?.role === "ADMIN"
    ? ["Dashboard", "Students", "Payment Requests", "Courses", "Study Materials", "MCQ Exam Builder", "Results"]
    : ["Course Catalog", "My Enrollments", "Study Materials", "Exams"];

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
          <button type="button" role="tab" aria-selected={authTab === "login"} className={authTab === "login" ? "active" : ""} onClick={() => setAuthTab("login")}>Login</button>
          <button type="button" role="tab" aria-selected={authTab === "register"} className={authTab === "register" ? "active" : ""} onClick={() => setAuthTab("register")}>Student Registration</button>
        </div>
        {authTab === "login" ? <form onSubmit={(event) => submitForm(event, handleAuth)} className="stack-form" role="tabpanel">
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" placeholder="আপনার পাসওয়ার্ড" autoComplete="current-password" required /></label>
          <button className="primary wide" disabled={busy}>{busy ? "অপেক্ষা করুন..." : "Login করুন"} <span>→</span></button>
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
        {error && <p className="alert error">{error}</p>}{message && <p className="alert success">{message}</p>}
      </div></div>
    </main>;
  }

  const title = tab;
  const paymentCourseName = (enrollment: Enrollment) => typeof enrollment.course === "object" ? enrollment.course.title : "";

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark">E</span><span>EduPrepX<small>LEARNING PORTAL</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <nav>{navItems.map((item) => <button key={item} onClick={() => { setTab(item); setExamTaking(null); }} className={`nav-item ${tab === item ? "selected" : ""}`}><span className="nav-icon">{icon(item)}</span>{item}{item === "Payment Requests" && adminStats.pendingPayments > 0 && <span className="nav-count">{adminStats.pendingPayments}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="support-box"><span className="support-icon">✦</span><strong>কোনো সাহায্য দরকার?</strong><p>পেমেন্ট বা কোর্স নিয়ে সহায়তা নিন।</p>{user.role === "STUDENT" ? <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">WhatsApp-এ যোগাযোগ · {whatsappNumber} →</a> : <a href="mailto:support@eduprepx.com">সহায়তা কেন্দ্রে যোগাযোগ →</a>}</div><div className="user-mini"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === "ADMIN" ? "Administrator" : "Student"}</small></div></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="breadcrumb">EduPrepX <span>/</span> {title}</span><h1>{title}</h1></div><div className="top-actions"><span className="today">{new Date().toLocaleDateString("bn-BD", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span><button className="notification" title="Notifications">♧<i /></button><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><button className="logout-button" onClick={signOut}><span aria-hidden="true">↪</span><span>Log out</span></button></div></header>
      <div className="content">
        {user.role === "ADMIN" && tab === "Courses" && !editingCourse && <div className="panel course-cover-editor"><div><strong>কোর্সের কভার ছবি</strong><p className="muted">JPEG, PNG বা WebP · সর্বোচ্চ ৫ MB; ছবির ফাইল MongoDB GridFS-এ থাকবে।</p></div><label className="cover-upload">ছবি নির্বাচন করুন<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runAction(async () => { setCoverImageFile(await compressCourseImage(file)); setCoverImageRemoved(false); }); }} /></label>{coverImagePreview && <><img src={coverImagePreview} alt="কোর্স কভার প্রিভিউ" /><button className="text-button danger-text" type="button" onClick={() => setCoverImageFile(null)}>ছবি সরান</button></>}</div>}
        {user.role === "ADMIN" && tab === "MCQ Exam Builder" && examCourse && <div className="panel exam-authoring-settings"><h3>পরীক্ষার নম্বর ও ব্যাখ্যা</h3><div className="exam-settings-grid"><label className="check-label"><input type="checkbox" checked={negativeMarkingEnabled} onChange={(event) => setNegativeMarkingEnabled(event.target.checked)} /> ভুল উত্তরে নম্বর কাটুন</label><label>প্রতি ভুল উত্তরে কর্তন<input type="number" min="0" step="0.01" value={negativeMarks} disabled={!negativeMarkingEnabled} onChange={(event) => setNegativeMarks(Number(event.target.value))} /></label><label>মেধাতালিকার নিয়ম<select value={leaderboardRule} onChange={(event) => setLeaderboardRule(event.target.value as typeof leaderboardRule)}><option value="FIRST">প্রথম প্রচেষ্টা</option><option value="HIGHEST">সর্বোচ্চ নম্বর</option><option value="LATEST">সর্বশেষ প্রচেষ্টা</option></select></label></div></div>}
        {message && <div className="alert success dismissible">{message}<button onClick={() => setMessage("")}>×</button></div>}
        {error && <div className="alert error dismissible">{error}<button onClick={() => setError("")}>×</button></div>}
        {user.role === "STUDENT" && tab === "Exams" && examSubmissionSummary && <section className={`exam-submission-summary ${examSubmissionSummary.passed ? "passed" : "not-passed"}`} aria-label="পরীক্ষার ফলাফল">
          <div className="exam-submission-heading">
            <div><span className="eyebrow">পরীক্ষার ফলাফল</span><h2>{examSubmissionSummary.title}</h2><p>{examSubmissionSummary.passed ? "অভিনন্দন, আপনি পাস করেছেন!" : "এবার পাস করা হয়নি—প্রস্তুতি নিয়ে আবার চেষ্টা করুন।"}</p></div>
            <button type="button" className="icon-button" aria-label="ফলাফলের বার্তা বন্ধ করুন" onClick={() => setExamSubmissionSummary(null)}>×</button>
          </div>
          <div className="exam-submission-score"><strong>{formatMarks(examSubmissionSummary.score)}<span> / {formatMarks(examSubmissionSummary.totalMarks)}</span></strong><span>চূড়ান্ত প্রাপ্ত নম্বর</span></div>
          <div className="exam-submission-metrics">
            <div><span>সঠিক উত্তরের নম্বর</span><strong>{formatMarks(examSubmissionSummary.correctMarks)}</strong></div>
            <div><span>নেগেটিভ কাটা</span><strong className={examSubmissionSummary.negativeMarksDeducted ? "deducted-marks" : ""}>{formatMarks(examSubmissionSummary.negativeMarksDeducted)}{examSubmissionSummary.scoreFloorApplied && <small> সর্বনিম্ন ০</small>}</strong></div>
            <div><span>মেধাস্থান</span><strong>{examSubmissionSummary.rank}<small> / {examSubmissionSummary.rankTotal}</small></strong></div>
            <div><span>সঠিক · ভুল · বাদ</span><strong>{examSubmissionSummary.correctCount} · {examSubmissionSummary.wrongCount} · {examSubmissionSummary.unansweredCount}</strong></div>
          </div>
        </section>}
        {user.role === "ADMIN" && tab === "Dashboard" && <section>
          <div className="welcome-row"><div><span className="eyebrow">OVERVIEW</span><h2>শুভেচ্ছা, {user.name.split(" ")[0]} 👋</h2><p className="muted">আপনার প্ল্যাটফর্মের আজকের সারসংক্ষেপ।</p></div><button className="secondary" onClick={refresh}>↻ &nbsp;Refresh data</button></div>
          <div className="stat-grid">{[
            ["Total Students", adminStats.students, "♧", "সক্রিয় শিক্ষার্থী অ্যাকাউন্ট"],
            ["Pending Payments", adminStats.pendingPayments, "৳", "যাচাইয়ের জন্য অপেক্ষায়"],
            ["Total Courses", adminStats.courses, "▤", "প্রকাশিত ও খসড়া কোর্স"],
            ["MCQ Exams", adminStats.exams, "▣", "তৈরি করা পরীক্ষা"]
          ].map(([label, value, ico, caption], index) => <div className="stat-card" key={label}><div className={`stat-icon tone-${index}`}>{ico}</div><div className="stat-caption">{caption}</div><div className="stat-value">{Number(value).toLocaleString("bn-BD")}</div><div className="stat-label">{label}</div></div>)}</div>
          <div className="section-heading"><div><h3>সাম্প্রতিক পেমেন্ট</h3><p className="muted">সর্বশেষ পেমেন্ট রিকোয়েস্টের অবস্থা</p></div><button className="text-button" onClick={() => setTab("Payment Requests")}>সব দেখুন →</button></div>
          <PaymentTable requests={requests.slice(0, 5)} decide={decidePayment} isAdmin />
          <p className="demo-note">Dashboard-এর সংখ্যা ডাটাবেস থেকে আসছে; এগুলো নমুনা বা Demo সংখ্যা নয়।</p>
        </section>}
        {user.role === "ADMIN" && tab === "Students" && <section><div className="section-heading"><div><h2>শিক্ষার্থী পরিচালনা</h2><p className="muted">নিবন্ধিত শিক্ষার্থীদের অ্যাকাউন্ট ও কার্যক্রম</p></div><span className="pill">{students.length} জন</span></div><div className="table-wrap"><table><thead><tr><th>শিক্ষার্থী</th><th>ইমেইল</th><th>এনরোলমেন্ট</th><th>পরীক্ষার ফল</th><th>অ্যাকাউন্ট</th><th>যোগদানের তারিখ</th><th>পরিচালনা</th></tr></thead><tbody>{students.map((student) => <tr key={student._id}><td><div className="person"><span className="avatar small">{student.name.slice(0, 1)}</span><strong>{student.name}</strong></div></td><td>{student.email ?? student.mobile ?? "—"}</td><td>{student.enrollments}</td><td>{student.results}</td><td><span className={`status ${student.active ? "approved" : "rejected"}`}>{student.active ? "ACTIVE" : "INACTIVE"}</span></td><td>{new Date(student.createdAt).toLocaleDateString("bn-BD")}</td><td><button className={student.active ? "reject-button" : "approve-button"} onClick={() => toggleStudent(student)}>{student.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table>{students.length === 0 && <Empty text="কোনো শিক্ষার্থী নেই।" />}</div></section>}
        {user.role === "ADMIN" && tab === "Payment Requests" && <section><div className="section-heading"><div><h2>পেমেন্ট রিকোয়েস্ট</h2><p className="muted">Transaction ID এবং পেমেন্টের তথ্য ম্যানুয়ালি যাচাই করুন।</p></div><span className="pill amber">{requests.filter((request) => request.status === "PENDING").length} Pending</span></div><PaymentTable requests={requests} decide={decidePayment} isAdmin /></section>}
        {user.role === "ADMIN" && tab === "Courses" && <section><div className="section-heading"><div><h2>কোর্স পরিচালনা</h2><p className="muted">কোর্স তৈরি করুন, ফি ও পেমেন্ট নির্দেশনা নির্ধারণ করুন।</p></div></div><div className="two-panel"><form className="panel stack-form" onSubmit={(event) => submitForm(event, createCourse)}><h3>নতুন কোর্স তৈরি</h3><label>কোর্সের নাম<input name="title" placeholder="যেমন: BCS Preliminary Preparation" required /></label><label>কোর্সের বিবরণ<textarea name="description" rows={3} required /></label><label>কোর্স ফি (৳)<input name="fee" type="number" min="0" step="1" required /></label><label>পেমেন্ট নির্দেশনা<textarea name="paymentInstructions" rows={2} placeholder="Merchant নম্বর ও পেমেন্টের নির্দেশনা লিখুন" required /></label><label className="check-label"><input type="checkbox" name="published" /> তৈরি করেই প্রকাশ করুন</label><button className="primary" disabled={busy}>কোর্স তৈরি করুন</button></form><div className="panel"><h3>সকল কোর্স <span className="pill">{courses.length}</span></h3>{courses.map((course) => <div className="course-admin" key={course._id}><div><strong>{course.title}</strong><p className="muted">{money(course.fee)} · {course.description}</p></div><div className="action-row"><button className="small-button" onClick={() => setEditingCourse(course)}>Edit</button><button className={course.published ? "small-button" : "small-button primary-small"} onClick={() => updateCourse(course, !course.published)}>{course.published ? "প্রকাশিত" : "প্রকাশ করুন"}</button><button className="small-button delete-course-button" onClick={() => void runAction(() => deleteCourse(course))}>মুছুন</button></div></div>)}{!courses.length && <Empty text="এখনও কোনো কোর্স তৈরি হয়নি।" />}</div></div></section>}
        {user.role === "ADMIN" && tab === "Study Materials" && <section><div className="section-heading"><div><h2>স্টাডি ম্যাটেরিয়াল</h2><p className="muted">PDF MongoDB GridFS-এ রাখুন; নোট/লিংকের URL সরাসরি যোগ করুন।</p></div></div><div className="two-panel"><form className="panel stack-form" onSubmit={(event) => submitForm(event, createMaterial)}><h3>নতুন উপকরণ যোগ করুন</h3><label>কোর্স<select name="courseId" required defaultValue=""><option value="" disabled>কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label><label>শিরোনাম<input name="title" required /></label><label>ধরন<select value={materialKind} onChange={(event) => setMaterialKind(event.target.value)}><option value="PDF">PDF ফাইল</option><option value="NOTE">Note URL</option><option value="LINK">External link</option></select></label>{materialKind === "PDF" ? <label>PDF ফাইল · সর্বোচ্চ ২০ MB<input ref={materialFileInput} name="file" type="file" accept="application/pdf,.pdf" required /></label> : <label>ফাইল/কনটেন্ট URL<input name="url" type="url" placeholder="https://..." required /></label>}<label>বিবরণ<textarea name="description" rows={2} /></label><button className="primary" disabled={busy}>উপকরণ যোগ করুন</button></form><div className="panel"><h3>কোর্সের উপকরণ দেখুন</h3><select value={selectedMaterialCourse} onChange={(event) => setSelectedMaterialCourse(event.target.value)}><option value="">কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select><MaterialList materials={materials} /></div></div></section>}
        {user.role === "ADMIN" && tab === "MCQ Exam Builder" && <section><div className="section-heading"><div><h2>MCQ Exam Builder</h2><p className="muted">সঠিক উত্তর সার্ভার-সাইডে সংরক্ষিত হবে, পরীক্ষার্থীর কাছে যাবে না।</p></div><button className="primary" onClick={() => setExamCourse(courses[0] ?? null)}>＋ নতুন পরীক্ষা</button></div>{examCourse && <form className="panel exam-builder stack-form" onSubmit={(event) => submitForm(event, createExam)}><div className="section-heading"><h3>পরীক্ষার তথ্য</h3><button type="button" className="icon-button" onClick={() => setExamCourse(null)}>×</button></div><label>কোর্স<select value={examCourse._id} onChange={(event) => setExamCourse(courses.find((course) => course._id === event.target.value) ?? null)}>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select></label><label>পরীক্ষার শিরোনাম<input name="title" placeholder="যেমন: Data Structure — Weekly Quiz" required /></label><div className="three-col"><label>সময় (মিনিট)<input name="durationMinutes" type="number" min="1" max="360" defaultValue="30" required /></label><label>Pass mark<input name="passMark" type="number" min="0" step="0.5" defaultValue="5" required /></label><label>শুরু হবে<input name="startsAt" type="datetime-local" required /></label></div><label>শেষ হবে<input name="endsAt" type="datetime-local" required /></label><div className="builder-heading"><h3>প্রশ্ন ও উত্তর</h3><span className="muted">প্রতি প্রশ্নে ঠিক ৪টি অপশন</span></div>        {examQuestions.map((question, index) => <div className="question-editor" key={index}><div className="question-title"><strong>প্রশ্ন {index + 1}</strong>{examQuestions.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setExamQuestions(examQuestions.filter((_, i) => i !== index))}>মুছুন</button>}</div><label>প্রশ্ন<input value={question.prompt} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, prompt: event.target.value } : q))} required /></label><div className="options-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<div className="option-input"><input value={option} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, options: q.options.map((value, n) => n === optionIndex ? event.target.value : value) } : q))} required /><input aria-label={`Option ${optionIndex + 1} সঠিক উত্তর`} type="radio" checked={question.correctIndex === optionIndex} onChange={() => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, correctIndex: optionIndex } : q))} /></div></label>)}</div><label>ব্যাখ্যা<textarea rows={2} maxLength={2000} value={question.explanation} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, explanation: event.target.value } : q))} placeholder="সঠিক উত্তরের কারণ লিখুন" /></label><label className="marks-input">Marks per question<input type="number" min="0.1" step="0.1" value={question.marks} onChange={(event) => setExamQuestions(examQuestions.map((q, i) => i === index ? { ...q, marks: Number(event.target.value) } : q))} required /></label></div>)}<button type="button" className="secondary" onClick={() => setExamQuestions([...examQuestions, blankQuestion()])}>＋ আরেকটি প্রশ্ন যোগ করুন</button><div className="builder-footer"><span>মোট নম্বর: <strong>{formatMarks(examQuestions.reduce((sum, q) => sum + Number(q.marks || 0), 0))}</strong></span><button className="primary" disabled={busy}>পরীক্ষা তৈরি করুন</button></div></form>}<div className="panel"><h3>কোর্স বেছে নিয়ে পরীক্ষার তালিকা</h3><select value={selectedMaterialCourse} onChange={(event) => setSelectedMaterialCourse(event.target.value)}><option value="">কোর্স নির্বাচন করুন</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}</select>{exams.map((exam) => <div className="course-admin" key={exam.id}><div><strong>{exam.title}</strong><p className="muted">{exam.questionCount} প্রশ্ন · {exam.durationMinutes} মিনিট · Pass mark {exam.passMark}</p></div><span className="status approved">READY</span></div>)}</div></section>}                        {user.role === "ADMIN" && tab === "Results" && <section><div className="section-heading"><div><h2>পরীক্ষার ফলাফল</h2><p className="muted">শিক্ষার্থীর প্রতিটি প্রচেষ্টার নম্বর, উত্তর ও মেধাস্থান</p></div></div><div className="results-list">{results.map((result) => <details className="result-card" key={result.id}><summary><div className="result-summary"><span className="avatar small">{result.student.name.slice(0, 1)}</span><div><strong>{result.student.name} · {result.exam.title} · প্রচেষ্টা {result.attemptNumber}</strong><small>{result.student.email ?? result.student.mobile} · {new Date(result.submittedAt).toLocaleString("bn-BD")}</small></div></div><span className={`status ${result.passed ? "approved" : "rejected"}`}>{formatMarks(result.score)}/{formatMarks(result.totalMarks)} · {result.passed ? "PASS" : "FAIL"} · মেধাস্থান {result.rank}/{result.rankTotal}</span></summary><div className="attempt-counts"><span>সঠিক নম্বর {formatMarks(result.correctMarks)}</span><span>নেগেটিভ কাটা {formatMarks(result.negativeMarksDeducted)}{result.scoreFloorApplied ? " (সর্বনিম্ন ০)" : ""}</span><span>প্রাপ্ত নম্বর {formatMarks(result.score)}/{formatMarks(result.totalMarks)}</span><span>সঠিক {result.correctCount}</span><span>ভুল {result.wrongCount}</span><span>উত্তরহীন {result.unansweredCount}</span></div><div className="answer-review">{result.details.map((answer, i) => <div key={i}><strong>{i + 1}. {answer.prompt}</strong><p className={answer.isCorrect ? "correct-answer" : "wrong-answer"}>শিক্ষার্থীর উত্তর: {answer.chosen} {answer.isCorrect ? "✓" : "✗"} · প্রাপ্ত {formatMarks(answer.earnedMarks)}/{formatMarks(answer.marks)}</p>{!answer.isCorrect && <p className="correct-answer">সঠিক উত্তর: {answer.correct}</p>}{answer.explanation && <p className="answer-explanation"><strong>ব্যাখ্যা:</strong> {answer.explanation}</p>}</div>)}</div></details>)}{!results.length && <Empty text="এখনও পরীক্ষার ফল নেই।" />}</div></section>}

        {user.role === "STUDENT" && tab === "Course Catalog" && <section><div className="welcome-row"><div><span className="eyebrow">DISCOVER</span><h2>আপনার পরবর্তী কোর্সটি খুঁজুন</h2><p className="muted">পছন্দের কোর্স বেছে নিয়ে এনরোলমেন্ট রিকোয়েস্ট করুন।</p></div></div><div className="course-grid">{courses.map((course, index) => {
          const enrollment = enrollments.find((item) => typeof item.course === "object" && "_id" in item.course && item.course._id === course._id);
          return <article className="course-card" key={course._id}><div className={`course-art art-${index % 4}`} style={course.coverImage ? { backgroundImage: `linear-gradient(rgba(14,32,28,.2),rgba(14,32,28,.2)),url("${course.coverImage}")` } : undefined}><span>COURSE</span><span className="art-symbol">{["◈", "▤", "⌘", "✦"][index % 4]}</span></div><div className="course-card-content"><div className="course-meta"><span>EDUPREPX PROGRAM</span><strong>{money(course.fee)}</strong></div><h3>{course.title}</h3><p>{course.description}</p><div className="course-card-footer">{enrollment ? <StatusPill status={enrollment.status} /> : <button className="primary" onClick={() => setPaymentCourse(course)}>Enroll now <span>→</span></button>}<span className="course-link">↗</span></div></div></article>;
        })}{!courses.length && <Empty text="এখনও কোনো কোর্স প্রকাশিত হয়নি।" />}</div></section>}
        {user.role === "STUDENT" && tab === "My Enrollments" && <section><div className="section-heading"><div><h2>আমার এনরোলমেন্ট</h2><p className="muted">পেমেন্ট যাচাই ও কোর্স অ্যাক্সেসের অবস্থা।</p></div></div><div className="panel table-wrap"><table><thead><tr><th>কোর্স</th><th>Transaction ID</th><th>পেমেন্ট</th><th>অবস্থা</th><th>বিবরণ</th></tr></thead><tbody>{enrollments.map((item) => <tr key={item._id}><td><strong>{paymentCourseName(item)}</strong></td><td className="mono">{item.transactionId}</td><td>{item.paymentMethod} · {item.senderMobile}</td><td><StatusPill status={item.status} /></td><td>{item.status === "REJECTED" ? item.rejectionReason : item.status === "APPROVED" ? "কোর্স অ্যাক্সেস চালু" : "Admin যাচাই করছেন"}</td></tr>)}</tbody>{!enrollments.length && <></>}</table>{!enrollments.length && <Empty text="আপনি এখনও কোনো কোর্সে এনরোল করেননি।" />}</div></section>}
        {user.role === "STUDENT" && tab === "Study Materials" && <section><div className="section-heading"><div><h2>স্টাডি ম্যাটেরিয়াল</h2><p className="muted">অনুমোদিত কোর্সের পাঠ্য উপকরণ।</p></div></div><CourseSelector courses={courses} enrollments={enrollments} value={selectedMaterialCourse} onChange={setSelectedMaterialCourse} /><MaterialList materials={materials} /></section>}
        {user.role === "STUDENT" && tab === "Exams" && <section>
          {examTaking ? <div className="panel exam-taking">
            <div className="exam-live-header"><div><span className="eyebrow">পরীক্ষা চলছে</span><h2>{examTaking.title}</h2></div><div className={`exam-countdown${remainingSeconds < 60 ? " urgent" : ""}`} role="timer" aria-live="polite"><small>সময় বাকি</small><strong>{String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}</strong></div></div>
            <div className="exam-progress-bar"><span>{answers.filter((answer) => answer >= 0).length}/{answers.length} Answered</span><span>{answers.filter((answer) => answer < 0).length} বাকি</span><i><b style={{ width: `${answers.filter((answer) => answer >= 0).length / Math.max(answers.length, 1) * 100}%` }} /></i></div>
            <nav className="question-nav" aria-label="প্রশ্ন নির্বাচন">{examTaking.questions.map((_, index) => <button key={index} type="button" className={`${index === currentQuestion ? "current" : ""}${answers[index] >= 0 ? " answered" : ""}`} aria-current={index === currentQuestion ? "step" : undefined} aria-label={`প্রশ্ন ${index + 1}${answers[index] >= 0 ? ", উত্তর দেওয়া হয়েছে" : ", উত্তর বাকি"}`} onClick={() => setCurrentQuestion(index)}>{index + 1}</button>)}</nav>
            {(() => { const question = examTaking.questions[currentQuestion]; return <div className="take-question" key={currentQuestion}><h3>{currentQuestion + 1}. {question.prompt}<span>{question.marks} নম্বর</span></h3>{question.options.map((option, optionIndex) => <label className={`answer-option ${answers[currentQuestion] === optionIndex ? "chosen" : ""}`} key={optionIndex}><input type="radio" name={`question-${currentQuestion}`} checked={answers[currentQuestion] === optionIndex} onChange={() => setAnswers(answers.map((answer, answerIndex) => answerIndex === currentQuestion ? optionIndex : answer))} />{String.fromCharCode(65 + optionIndex)}. {option}</label>)}</div>; })()}
            <div className="exam-navigation-actions"><button className="secondary" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion((question) => Math.max(0, question - 1))}>← আগের প্রশ্ন</button><button className="secondary" disabled={currentQuestion === examTaking.questions.length - 1} onClick={() => setCurrentQuestion((question) => Math.min(examTaking.questions.length - 1, question + 1))}>পরের প্রশ্ন →</button><button className="primary" disabled={busy} onClick={submitExam}>পরীক্ষা জমা দিন</button></div>
          </div> : <>
            <div className="section-heading"><div><h2>MCQ পরীক্ষা</h2><p className="muted">প্রকাশিত পরীক্ষায় অংশ নিতে অনুমোদিত কোর্স নির্বাচন করুন।</p></div></div>
            <CourseSelector courses={courses} enrollments={enrollments} value={selectedMaterialCourse} onChange={setSelectedMaterialCourse} />
            {exams.map((exam) => <article className="exam-card" key={exam.id}>
              <div className="exam-icon">▣</div>
              <div className="exam-info"><strong>{exam.title}</strong><p>{exam.questionCount} প্রশ্ন · {exam.durationMinutes} মিনিট · Pass mark {exam.passMark}</p><small>পরীক্ষার সময়: {new Date(exam.startsAt).toLocaleString("bn-BD")} – {new Date(exam.endsAt).toLocaleString("bn-BD")}</small></div>
              <div className="student-result"><p className="exam-policy">মেধাতালিকা: {exam.leaderboardRule === "FIRST" ? "প্রথম প্রচেষ্টা" : exam.leaderboardRule === "LATEST" ? "সর্বশেষ প্রচেষ্টা" : "সর্বোচ্চ নম্বর"}{exam.negativeMarkingEnabled ? ` · ভুল উত্তরে -${exam.negativeMarks}` : " · নেগেটিভ মার্কিং নেই"}</p>{exam.results.length > 0 && <ExamAttemptHistory exam={exam} />}<button className="primary" onClick={() => startExam(exam)}>{exam.results.length ? "আবার পরীক্ষা দিন →" : "পরীক্ষা শুরু করুন →"}</button></div>
            </article>)}
            {selectedMaterialCourse && exams.length === 0 && <Empty text="এই কোর্সে এখন কোনো পরীক্ষা নেই।" />}
          </>}
        </section>}
      </div>
    </main>
    {paymentCourse && <div className="modal-backdrop" onClick={() => setPaymentCourse(null)}><section className="modal" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">ENROLLMENT REQUEST</span><h2>পেমেন্ট তথ্য জমা দিন</h2></div><button className="icon-button" onClick={() => setPaymentCourse(null)}>×</button></div><div className="payment-course"><strong>{paymentCourse.title}</strong><span>{money(paymentCourse.fee)}</span></div><p className="instruction">{paymentCourse.paymentInstructions}</p><form className="stack-form" onSubmit={(event) => submitForm(event, submitPayment)}><label>Payment Method<select name="paymentMethod"><option value="BKASH">bKash</option><option value="NAGAD">Nagad</option></select></label><label>Transaction ID<input name="transactionId" placeholder="যেমন: 8F72K9A1" required minLength={5} maxLength={40} /></label><label>Sender Mobile Number<input name="senderMobile" placeholder="01XXXXXXXXX" required /></label><p className="warning-note">এটি একটি UI-ভিত্তিক তথ্য জমা। এই ফর্মে প্রকৃত পেমেন্ট বা স্বয়ংক্রিয় যাচাই হচ্ছে না। Admin অনুমোদন না দেওয়া পর্যন্ত কোর্স আনলক হবে না।</p><button className="primary wide" disabled={busy}>পেমেন্ট রিকোয়েস্ট জমা দিন</button></form></section></div>}
    {editingCourse && <div className="modal-backdrop" onClick={() => setEditingCourse(null)}><section className="modal" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">COURSE MANAGEMENT</span><h2>কোর্স সম্পাদনা</h2></div><button className="icon-button" onClick={() => setEditingCourse(null)}>×</button></div><form className="stack-form" onSubmit={(event) => submitForm(event, saveCourse)}><label>কোর্সের নাম<input name="title" defaultValue={editingCourse.title} required /></label><label>বিবরণ<textarea name="description" rows={3} defaultValue={editingCourse.description} required /></label><label>কোর্স ফি (৳)<input name="fee" type="number" min="0" defaultValue={editingCourse.fee} required /></label><label>পেমেন্ট নির্দেশনা<textarea name="paymentInstructions" rows={2} defaultValue={editingCourse.paymentInstructions} required /></label><div className="edit-course-cover"><strong>কোর্সের কভার ছবি</strong>{(coverImagePreview || (!coverImageRemoved && coverImageUrl)) && <img src={coverImagePreview || coverImageUrl} alt="কোর্স কভার প্রিভিউ" />}<label className="cover-upload">ছবি নির্বাচন করুন<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void runAction(async () => { setCoverImageFile(await compressCourseImage(file)); setCoverImageRemoved(false); }); }} /></label>{(coverImageFile || coverImageUrl) && <button className="text-button danger-text" type="button" onClick={() => { setCoverImageFile(null); setCoverImageRemoved(true); }}>ছবি সরান</button>}<small>ছবির ফাইল MongoDB GridFS-এ থাকবে; course record-এ এর URL রাখা হবে।</small></div><label className="check-label"><input type="checkbox" name="published" defaultChecked={editingCourse.published} /> কোর্স প্রকাশ করুন</label><button className="primary" disabled={busy}>পরিবর্তন সংরক্ষণ</button></form></section></div>}
  </div>;
}

function icon(label: string) {
  const symbols: Record<string, string> = { Dashboard: "▦", Students: "♧", "Payment Requests": "৳", Courses: "▤", "Study Materials": "▧", "MCQ Exam Builder": "☷", Results: "▥", "Course Catalog": "⌕", "My Enrollments": "▣", Exams: "▤" };
  return symbols[label] ?? "◦";
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
  return <span className={`status ${status.toLowerCase()}`}>{status}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><span>◇</span><p>{text}</p></div>;
}

function PaymentTable({ requests, decide, isAdmin }: { requests: Enrollment[]; decide: (enrollment: Enrollment, status: "APPROVED" | "REJECTED") => void; isAdmin?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>শিক্ষার্থী</th><th>কোর্স</th><th>Payment info</th><th>Transaction ID</th><th>অবস্থা</th>{isAdmin && <th>সিদ্ধান্ত</th>}</tr></thead><tbody>{requests.map((request) => <tr key={request._id}><td>{request.student?.name ?? "—"}<small className="block muted">{request.student?.email ?? request.student?.mobile}</small></td><td>{typeof request.course === "object" ? request.course.title : "—"}</td><td>{request.paymentMethod}<small className="block muted">{request.senderMobile}</small></td><td className="mono">{request.transactionId}</td><td><StatusPill status={request.status} /></td>{isAdmin && <td>{request.status === "PENDING" ? <div className="action-row"><button className="approve-button" onClick={() => decide(request, "APPROVED")}>Approve</button><button className="reject-button" onClick={() => decide(request, "REJECTED")}>Reject</button></div> : <span className="muted">Reviewed</span>}</td>}</tr>)}</tbody></table>{requests.length === 0 && <Empty text="কোনো পেমেন্ট রিকোয়েস্ট নেই।" />}</div>;
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

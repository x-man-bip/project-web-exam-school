import { useEffect, useState, useCallback } from "react";
import {
  CalendarClock, Plus, Pencil, Trash2, Clock, Play, FileText, AlertCircle, Key,
  Send as SendApproval, CheckSquare, XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { targetLabelForQuestion } from "@/lib/questionTarget";
import { fetchTeacherClasses } from "@/lib/teacherClasses";
import { fetchTeacherSubjects } from "@/lib/teacherSubjects";
import { useAuth } from "@/lib/auth";
import {
  type Question, type Exam, type ClassRoom, type Subject, type ExamAttempt, type Answer,
  type ExamApprovalStatus,
  QUESTION_TYPE_LABELS, EXAM_APPROVAL_LABELS,
} from "@/lib/types";
import { Badge, Spinner, EmptyState } from "@/components/ui";
import { ExamCardSkeleton } from "@/components/ExamSkeletons";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { ExamFormModal } from "@/components/ExamFormModal";
import { ManageExamQuestionsModal } from "@/components/ManageExamQuestionsModal";

/* ============================
   Exams
   ============================ */
export function TeacherExams() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [tokenExamIds, setTokenExamIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [manageExam, setManageExam] = useState<Exam | null>(null);
  const [rejectionExam, setRejectionExam] = useState<Exam | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [e, q, taughtSubjects, taughtClasses, t] = await Promise.all([
      supabase.from("exams").select("*, subject:subjects(*), class:classes(*)").eq("teacher_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("questions").select("*, class:classes(*)").eq("teacher_id", profile.id).order("created_at", { ascending: false }),
      fetchTeacherSubjects(profile.id),
      fetchTeacherClasses(profile.id),
      supabase.from("exam_access_tokens").select("exam_id"),
    ]);
    setClasses(taughtClasses);
    setExams(e.data as Exam[] ?? []);
    setQuestions(q.data as Question[] ?? []);
    setSubjects(taughtSubjects.sort((a, b) => a.name.localeCompare(b.name, "id")));
    setTokenExamIds(new Set((t.data ?? []).map((row) => row.exam_id as string)));
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (exam: Exam) => {
    if (exam.status === "draft") {
      await supabase.from("exams").update({ status: "published" }).eq("id", exam.id);
    } else if (exam.status === "published") {
      await supabase.from("exams").update({ status: "draft" }).eq("id", exam.id);
    }
    load();
  };

  const activateExam = async (exam: Exam) => {
    await supabase.rpc("activate_exam", { p_exam_id: exam.id });
    load();
  };

  const submitForApproval = async (exam: Exam) => {
    await supabase.from("exams").update({ approval_status: "pending", approval_note: null }).eq("id", exam.id);
    load();
  };

  const approvalBadge = (status: ExamApprovalStatus) => {
    const colors: Record<ExamApprovalStatus, "slate" | "warning" | "success" | "error"> = {
      draft: "slate",
      pending: "warning",
      approved: "success",
      rejected: "error",
    };
    return <Badge color={colors[status]}>{EXAM_APPROVAL_LABELS[status]}</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ujian</h1>
          <p className="text-sm text-slate-500 mt-1">Buat dan jadwalkan ujian</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
          <Plus size={18} /> Buat Ujian
        </button>
      </div>

      {loading ? <ExamCardSkeleton count={4} /> :
        exams.length === 0 ? (
          <EmptyState icon={<CalendarClock size={28} />} title="Belum ada ujian" description="Buat ujian pertama Anda." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exams.map((exam) => {
              const canStart = exam.approval_status === "approved";
              const startTooltip = !canStart ? "Ujian belum disetujui oleh Kepala Sekolah" : "Mulai ujian";
              return (
                <div key={exam.id} className="card p-5 group hover:shadow-cardHover transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {exam.status === "active" ? (
                          <Badge color="success"><Play size={12} /> Berlangsung</Badge>
                        ) : exam.status === "published" ? (
                          <Badge color="brand">Dijadwalkan</Badge>
                        ) : (
                          <Badge color="slate">Draft</Badge>
                        )}
                        {approvalBadge(exam.approval_status)}
                        <Badge color="accent">{exam.subject?.name}</Badge>
                        <Badge color="slate">{targetLabelForQuestion(exam)}</Badge>
                        {exam.strict_mode && <Badge color="error">Strict</Badge>}
                        {tokenExamIds.has(exam.id) && <Badge color="brand"><Key size={12} /> Token</Badge>}
                      </div>
                      <h3 className="font-semibold text-slate-800 truncate">{exam.title}</h3>
                      {exam.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{exam.description}</p>}
                      {exam.approval_status === "rejected" && exam.approval_note && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-error-50 border border-error-200 px-3 py-2 cursor-pointer" onClick={() => setRejectionExam(exam)}>
                          <XCircle size={14} className="text-error-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-error-600">Ditolak KS - klik untuk lihat catatan revisi</p>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{exam.approval_note}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Clock size={14} /> {exam.duration_minutes} menit</span>
                        {exam.start_time && <span>{new Date(exam.start_time).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                    <button onClick={() => setManageExam(exam)} className="btn-secondary text-xs px-3 py-1.5"><FileText size={14} /> Kelola Soal</button>
                    {(exam.approval_status === "draft" || exam.approval_status === "rejected") && (
                      <button onClick={() => submitForApproval(exam)} className="btn-secondary text-xs px-3 py-1.5"><SendApproval size={14} /> Ajukan ke KS</button>
                    )}
                    {exam.approval_status === "pending" && (
                      <span className="text-xs text-warning-600 px-3 py-1.5 flex items-center gap-1"><AlertCircle size={14} /> Menunggu persetujuan</span>
                    )}
                    {canStart && exam.status === "published" && (
                      <button onClick={() => activateExam(exam)} className="btn-primary text-xs px-3 py-1.5 bg-success-600 hover:bg-success-700"><Play size={14} /> Mulai Ujian</button>
                    )}
                    {!canStart && exam.status !== "active" && (
                      <button disabled title={startTooltip} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed flex items-center gap-1">
                        <Play size={14} /> Mulai Ujian
                      </button>
                    )}
                    {exam.status === "active" && (
                      <button onClick={() => togglePublish(exam)} className="btn-secondary text-xs px-3 py-1.5">Nonaktifkan</button>
                    )}
                    <button onClick={() => { setEditing(exam); setShowForm(true); }} className="btn-ghost text-xs px-3 py-1.5"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(exam)} className="btn-ghost text-xs px-3 py-1.5 text-error-500 hover:bg-error-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Rejection note modal */}
      {rejectionExam && (
        <Modal open={true} onClose={() => setRejectionExam(null)} title="Catatan Revisi dari KS" size="sm">
          <div className="space-y-4">
            <div className="rounded-lg bg-error-50 border border-error-200 p-4">
              <p className="text-sm font-medium text-error-700 mb-1">Ujian: {rejectionExam.title}</p>
              <p className="text-xs text-error-500">Ditolak pada {rejectionExam.approved_at ? new Date(rejectionExam.approved_at).toLocaleString("id-ID") : "-"}</p>
            </div>
            <div>
              <label className="label">Catatan Revisi</label>
              <p className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-4">{rejectionExam.approval_note ?? "Tidak ada catatan"}</p>
            </div>
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-700">
              Silakan perbaiki soal/ujian sesuai catatan, lalu ajukan kembali ke Kepala Sekolah.
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectionExam(null); setManageExam(rejectionExam); }} className="btn-secondary text-sm">Perbaiki Soal</button>
              <button onClick={() => setRejectionExam(null)} className="btn-primary text-sm">Mengerti</button>
            </div>
          </div>
        </Modal>
      )}

      {showForm && (
        <ExamFormModal
          exam={editing}
          subjects={subjects}
          classes={classes}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {manageExam && (
        <ManageExamQuestionsModal
          exam={manageExam}
          questions={questions}
          onClose={() => setManageExam(null)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await supabase.from("exams").delete().eq("id", deleteTarget.id);
          load();
        }}
        title="Hapus Ujian"
        message="Yakin ingin menghapus ujian ini?"
        confirmText="Hapus"
        danger
      />
    </div>
  );
}

/* ============================
   Grading (Koreksi Uraian)
   ============================ */

interface GradingExamInfo {
  exam_id: string;
  exam_title: string;
  class_name: string;
  attempts: ExamAttempt[];
}

type GradingMode = "per_student" | "per_question";
type GradingStatusFilter = "all" | "ungraded" | "graded";

export function TeacherGrading() {
  const { profile } = useAuth();
  const [examGroups, setExamGroups] = useState<GradingExamInfo[]>([]);
  const [allAnswers, setAllAnswers] = useState<Record<string, Answer[]>>({});
  const [loading, setLoading] = useState(true);
  const [gradingLoading, setGradingLoading] = useState(false);

  const [filterClass, setFilterClass] = useState("");
  const [filterExam, setFilterExam] = useState("");
  const [filterStatus, setFilterStatus] = useState<GradingStatusFilter>("all");

  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [gradingMode, setGradingMode] = useState<GradingMode>("per_student");
  const [currentStudentIdx, setCurrentStudentIdx] = useState(0);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [scoreInput, setScoreInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: examIds } = await supabase.from("exams").select("id, title, class_id, class_level, class:classes(name)").eq("teacher_id", profile.id).order("created_at", { ascending: false });
    const exams = (examIds ?? []) as unknown as any[];
    if (exams.length === 0) { setExamGroups([]); setLoading(false); return; }

    const ids = exams.map((e) => e.id);
    const { data: attemptData } = await supabase
      .from("exam_attempts")
      .select("*, student:profiles!student_id(full_name, identifier), exam:exams(title)")
      .in("exam_id", ids)
      .neq("status", "in_progress")
      .order("submit_time", { ascending: false });
    const attempts = (attemptData ?? []) as ExamAttempt[];

    const answerPromises = ids.map((eid) =>
      supabase.from("answers").select("*, question:questions(*)").in("attempt_id", attempts.filter((a) => a.exam_id === eid).map((a) => a.id))
    );
    const answerResults = await Promise.all(answerPromises);
    const answerMap: Record<string, Answer[]> = {};
    ids.forEach((eid, i) => { answerMap[eid] = (answerResults[i].data as Answer[]) ?? []; });
    setAllAnswers(answerMap);

    const oneVal = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v;

    const groups: GradingExamInfo[] = exams.map((e) => {
      const cls = oneVal(e.class as any);
      return {
        exam_id: e.id,
        exam_title: e.title,
        class_name: cls?.name ?? (e.class_level ? `Kelas ${e.class_level}` : "-"),
        attempts: attempts.filter((a) => a.exam_id === e.id),
      };
    });
    setExamGroups(groups);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const getEssayAnswers = (examId: string, attemptId: string): Answer[] => {
    return (allAnswers[examId] ?? []).filter((a) => a.attempt_id === attemptId && a.question?.type === "uraian");
  };

  const getEssayQuestions = (examId: string): { id: string; content: string; points: number; correct_answer: any }[] => {
    const answers = allAnswers[examId] ?? [];
    const seen = new Set<string>();
    const questions: { id: string; content: string; points: number; correct_answer: any }[] = [];
    for (const a of answers) {
      if (a.question?.type === "uraian" && !seen.has(a.question.id)) {
        seen.add(a.question.id);
        questions.push({ id: a.question.id, content: a.question.content, points: a.question.points, correct_answer: a.question.correct_answer });
      }
    }
    return questions;
  };

  const selectedExam = examGroups.find((g) => g.exam_id === selectedExamId);

  const filteredExams = examGroups.filter((g) => {
    if (filterExam && g.exam_id !== filterExam) return false;
    if (filterClass) {
      if (!g.class_name.toLowerCase().includes(filterClass.toLowerCase())) return false;
    }
    return true;
  });

  const filteredAttempts = (selectedExam?.attempts ?? []).filter((a) => {
    if (filterStatus === "ungraded") {
      const essays = getEssayAnswers(selectedExamId!, a.id);
      return essays.length > 0 && !essays.every((e) => e.graded);
    }
    if (filterStatus === "graded") {
      const essays = getEssayAnswers(selectedExamId!, a.id);
      return essays.length > 0 && essays.every((e) => e.graded);
    }
    return true;
  });

  const essayQuestions = selectedExamId ? getEssayQuestions(selectedExamId) : [];
  const safeStudentIdx = Math.min(currentStudentIdx, Math.max(0, filteredAttempts.length - 1));
  const safeQuestionIdx = Math.min(currentQuestionIdx, Math.max(0, essayQuestions.length - 1));
  const currentAttempt = filteredAttempts[safeStudentIdx];
  const currentQuestion = essayQuestions[safeQuestionIdx];

  const currentAnswerForStudentMode = (): Answer | null => {
    if (!currentAttempt || !selectedExamId) return null;
    const essays = getEssayAnswers(selectedExamId, currentAttempt.id);
    return essays[safeQuestionIdx] ?? null;
  };

  const currentAnswerForQuestionMode = (): Answer | null => {
    if (!currentQuestion || !currentAttempt) return null;
    const answers = allAnswers[selectedExamId!] ?? [];
    return answers.find((a) => a.attempt_id === currentAttempt.id && a.question_id === currentQuestion.id) ?? null;
  };

  const currentAnswer = gradingMode === "per_student" ? currentAnswerForStudentMode() : currentAnswerForQuestionMode();

  useEffect(() => {
    if (currentAnswer) {
      setScoreInput(String(currentAnswer.score));
      setFeedbackInput(currentAnswer.feedback ?? "");
    } else {
      setScoreInput("");
      setFeedbackInput("");
    }
  }, [currentAnswer?.id, gradingMode, safeStudentIdx, safeQuestionIdx]);

  const gradeAndAdvance = async () => {
    if (!currentAnswer) return;
    const score = Number(scoreInput);
    if (isNaN(score)) return;
    setGradingLoading(true);
    await supabase.rpc("grade_essay", { p_answer_id: currentAnswer.id, p_score: score, p_feedback: feedbackInput || null });
    await load();
    setGradingLoading(false);

    if (gradingMode === "per_student") {
      if (safeQuestionIdx < essayQuestions.length - 1) {
        setCurrentQuestionIdx(safeQuestionIdx + 1);
      } else if (safeStudentIdx < filteredAttempts.length - 1) {
        setCurrentStudentIdx(safeStudentIdx + 1);
        setCurrentQuestionIdx(0);
      }
    } else {
      if (safeStudentIdx < filteredAttempts.length - 1) {
        setCurrentStudentIdx(safeStudentIdx + 1);
      } else if (safeQuestionIdx < essayQuestions.length - 1) {
        setCurrentQuestionIdx(safeQuestionIdx + 1);
        setCurrentStudentIdx(0);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!gradingLoading) gradeAndAdvance();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handlePublishAll = async () => {
    if (!selectedExamId) return;
    setPublishLoading(true);
    const attempts = selectedExam?.attempts ?? [];
    let ok = 0, fail = 0;
    for (const a of attempts) {
      const { error } = await supabase.from("exam_attempts").update({ status: "submitted" }).eq("id", a.id);
      if (error) fail++; else ok++;
    }
    setPublishLoading(false);
    setShowPublishConfirm(false);
    setPublishMsg({ ok: fail === 0, text: fail === 0 ? `Semua nilai berhasil dipublikasikan (${ok} siswa).` : `${ok} siswa berhasil, ${fail} gagal.` });
    load();
  };

  const allGraded = selectedExam && selectedExam.attempts.length > 0 && selectedExam.attempts.every((a) => {
    const essays = getEssayAnswers(selectedExam.exam_id, a.id);
    return essays.length > 0 && essays.every((e) => e.graded);
  });

  if (loading) return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Koreksi Uraian</h1>
        <p className="text-sm text-slate-500 mt-1">Beri nilai jawaban uraian siswa</p>
      </div>
      <div className="flex justify-center py-20"><Spinner size={32} /></div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in" onKeyDown={undefined}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Koreksi Uraian</h1>
        <p className="text-sm text-slate-500 mt-1">Beri nilai jawaban uraian siswa</p>
      </div>

      {publishMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${publishMsg.ok ? "bg-success-50 border-success-200 text-success-700" : "bg-error-50 border-error-200 text-error-700"}`}>
          {publishMsg.text}
        </div>
      )}

      {!selectedExamId ? (
        <>
          <div className="card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Pilih Kelas</label>
                <select className="input" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                  <option value="">Semua Kelas</option>
                  {[...new Set(examGroups.map((g) => g.class_name).filter((c) => c !== "-"))].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Pilih Ujian</label>
                <select className="input" value={filterExam} onChange={(e) => setFilterExam(e.target.value)}>
                  <option value="">Semua Ujian</option>
                  {examGroups.map((g) => <option key={g.exam_id} value={g.exam_id}>{g.exam_title}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Filter Status</label>
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as GradingStatusFilter)}>
                  <option value="all">Semua</option>
                  <option value="ungraded">Belum Dikoreksi</option>
                  <option value="graded">Selesai</option>
                </select>
              </div>
            </div>
          </div>

          {filteredExams.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="mx-auto w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
                <CheckSquare size={36} className="text-brand-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">Belum ada ujian selesai</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">Ujian yang sudah disubmit siswa akan muncul di sini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredExams.map((g) => {
                const totalStudents = g.attempts.length;
                const gradedCount = g.attempts.filter((a) => {
                  const essays = getEssayAnswers(g.exam_id, a.id);
                  return essays.length > 0 && essays.every((e) => e.graded);
                }).length;
                const hasEssay = essayQuestions.length > 0 || (allAnswers[g.exam_id] ?? []).some((a) => a.question?.type === "uraian");
                const progress = totalStudents > 0 ? Math.round((gradedCount / totalStudents) * 100) : 0;
                return (
                  <div
                    key={g.exam_id}
                    className="card p-5 group hover:shadow-cardHover transition cursor-pointer"
                    onClick={() => { setSelectedExamId(g.exam_id); setCurrentStudentIdx(0); setCurrentQuestionIdx(0); setPublishMsg(null); }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate">{g.exam_title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{g.class_name}</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                        <FileText size={14} /> {totalStudents} siswa
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Progress Koreksi</span>
                        <span className="font-semibold text-slate-700">{gradedCount}/{totalStudents}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? "bg-success-500" : "bg-brand-500"}`} style={{ width: `${progress}%` }} />
                      </div>
                      {progress === 100 && totalStudents > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600"><CheckSquare size={12} /> Siap dipublikasikan</span>
                      ) : hasEssay ? (
                        <span className="text-xs text-slate-400">{totalStudents - gradedCount} siswa belum dikoreksi</span>
                      ) : (
                        <span className="text-xs text-slate-400">Tidak ada soal uraian</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button onClick={() => { setSelectedExamId(null); setPublishMsg(null); }} className="text-sm text-brand-600 font-medium hover:underline mb-1">&larr; Kembali ke daftar ujian</button>
              <h2 className="text-lg font-semibold text-slate-800">{selectedExam?.exam_title}</h2>
              <p className="text-xs text-slate-400">{selectedExam?.class_name} — {filteredAttempts.length} siswa</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  onClick={() => { setGradingMode("per_student"); setCurrentStudentIdx(0); setCurrentQuestionIdx(0); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${gradingMode === "per_student" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Per Siswa
                </button>
                <button
                  onClick={() => { setGradingMode("per_question"); setCurrentStudentIdx(0); setCurrentQuestionIdx(0); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${gradingMode === "per_question" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Per Nomor Soal
                </button>
              </div>
              {allGraded && (
                <button onClick={() => setShowPublishConfirm(true)} className="btn-primary text-sm bg-success-600 hover:bg-success-700">
                  <CheckSquare size={16} /> Publikasikan Semua Nilai
                </button>
              )}
            </div>
          </div>

          {publishMsg && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${publishMsg.ok ? "bg-success-50 border-success-200 text-success-700" : "bg-error-50 border-error-200 text-error-700"}`}>
              {publishMsg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <select className="input w-auto text-sm py-1.5" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as GradingStatusFilter); setCurrentStudentIdx(0); }}>
              <option value="all">Semua Status</option>
              <option value="ungraded">Belum Dikoreksi</option>
              <option value="graded">Selesai Dikoreksi</option>
            </select>
          </div>

          {filteredAttempts.length === 0 || essayQuestions.length === 0 ? (
            <div className="card p-12">
              <EmptyState icon={<FileText size={28} />} title={essayQuestions.length === 0 ? "Tidak ada soal uraian" : "Tidak ada siswa"} description={essayQuestions.length === 0 ? "Ujian ini tidak memiliki soal tipe uraian." : "Tidak ada siswa yang cocok dengan filter ini."} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {gradingMode === "per_student" ? (
                  <span>Siswa {safeStudentIdx + 1} dari {filteredAttempts.length} — Soal {safeQuestionIdx + 1} dari {essayQuestions.length}</span>
                ) : (
                  <span>Soal {safeQuestionIdx + 1} dari {essayQuestions.length} — Siswa {safeStudentIdx + 1} dari {filteredAttempts.length}</span>
                )}
                {currentAnswer?.graded && <Badge color="success">Sudah dikoreksi</Badge>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-400">Jawaban Siswa</p>
                      <p className="text-sm font-semibold text-slate-800">{currentAttempt?.student?.full_name}</p>
                      {currentAttempt?.student?.identifier && <p className="text-xs text-slate-400">NIS: {currentAttempt.student.identifier}</p>}
                    </div>
                    {gradingMode === "per_student" && (
                      <div className="flex gap-1">
                        {essayQuestions.map((_, qi) => (
                          <button
                            key={qi}
                            onClick={() => setCurrentQuestionIdx(qi)}
                            className={`h-7 w-7 rounded-md text-xs font-medium transition ${
                              qi === safeQuestionIdx ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >{qi + 1}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-400 mb-1">Soal {safeQuestionIdx + 1}:</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{gradingMode === "per_student" ? (currentAnswer?.question?.content ?? essayQuestions[safeQuestionIdx]?.content) : (currentQuestion?.content ?? "-")}</p>
                  </div>
                  <div className="rounded-lg bg-brand-50/50 border border-brand-100 p-3">
                    <p className="text-xs font-medium text-slate-400 mb-1">Jawaban:</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap min-h-[80px]">
                      {currentAnswer ? (typeof currentAnswer.answer === "string" ? currentAnswer.answer : JSON.stringify(currentAnswer.answer)) : "Belum dijawab"}
                    </p>
                  </div>
                  {currentAnswer?.feedback && (
                    <div className="rounded-lg bg-warning-50 border border-warning-200 p-3">
                      <p className="text-xs font-medium text-warning-600 mb-1">Catatan sebelumnya:</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{currentAnswer.feedback}</p>
                    </div>
                  )}
                </div>

                <div className="card p-5 space-y-4">
                  <p className="text-xs font-medium text-slate-400">Kunci Jawaban & Penilaian</p>

                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-400 mb-1">Kunci / Rubrik Penilaian:</p>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {(gradingMode === "per_student" ? currentAnswer?.question?.correct_answer : currentQuestion?.correct_answer) || "Tidak ada kunci jawaban"}
                    </p>
                  </div>

                  <div>
                    <label className="label">Nilai (0 — {(gradingMode === "per_student" ? currentAnswer?.question?.points : currentQuestion?.points) ?? 100})</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max={(gradingMode === "per_student" ? currentAnswer?.question?.points : currentQuestion?.points) ?? 100} step="0.5"
                        className="input w-28"
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!gradingLoading) gradeAndAdvance(); } }}
                      />
                      <span className="text-sm text-slate-400">/ {(gradingMode === "per_student" ? currentAnswer?.question?.points : currentQuestion?.points) ?? 100}</span>
                    </div>
                  </div>

                  <div>
                    <label className="label">Catatan / Umpan Balik untuk Siswa</label>
                    <textarea
                      className="input min-h-[80px]"
                      placeholder="Tulis umpan balik opsional..."
                      value={feedbackInput}
                      onChange={(e) => setFeedbackInput(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={gradeAndAdvance}
                      disabled={gradingLoading || !currentAnswer}
                      className="btn-primary text-sm flex-1"
                    >
                      {gradingLoading ? <Spinner size={16} /> : <CheckSquare size={16} />} Simpan & Lanjut
                    </button>
                    <button
                      onClick={() => {
                        if (gradingMode === "per_student") {
                          if (safeStudentIdx > 0) { setCurrentStudentIdx(safeStudentIdx - 1); setCurrentQuestionIdx(0); }
                        } else {
                          if (safeStudentIdx > 0) setCurrentStudentIdx(safeStudentIdx - 1);
                        }
                      }}
                      disabled={safeStudentIdx === 0}
                      className="btn-secondary text-sm disabled:opacity-40"
                    >Sebelumnya</button>
                  </div>
                  <p className="text-xs text-slate-400 text-center">Tekan <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-mono">Enter</kbd> untuk menyimpan & lanjut</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        onConfirm={handlePublishAll}
        title="Publikasikan Semua Nilai"
        message={
          <>
            <p>Publikasikan nilai untuk semua siswa di ujian <strong>{selectedExam?.exam_title}</strong>?</p>
            <p className="mt-2 text-xs text-slate-500">Nilai akan dikunci dan siswa dapat melihat hasilnya. Pastikan semua jawaban sudah dikoreksi.</p>
          </>
        }
        confirmText={publishLoading ? "Memproses..." : "Ya, Publikasikan"}
        danger
      />
    </div>
  );
}

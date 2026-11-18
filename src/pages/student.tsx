import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Clock, FileText, CheckCircle, AlertTriangle, Wifi, WifiOff,
  ChevronLeft, ChevronRight, Flag, Play, Lock, Key, Eye, EyeOff,
  Loader2, Check, X, Award, Search, Filter, RefreshCw, CalendarClock,
  ListChecks, Timer, ArrowRight, Monitor, CloudUpload, CloudOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  useAnswerAutosave, localDraftKey, clearLocalDraft, submitAttempt, retryWhileOffline,
  type SaveStatus,
} from "@/lib/answerAutosave";
import { navigate } from "@/lib/router";
import {
  type Exam, type ExamAttempt, type StudentExamData,
  type QuestionType, type QuestionOption, parseStudentExam, normalizeOption, QUESTION_TYPE_LABELS,
} from "@/lib/types";
import { Badge, Spinner, EmptyState, StatCard } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/Modal";

/* ============================
   Student Dashboard
   ============================ */

interface ExamWithCount extends Exam {
  question_count?: number;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function formatTimeRemaining(endTime: string | null): string | null {
  if (!endTime) return null;
  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return "Berakhir";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} hari ${hours % 24} jam`;
  }
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes} menit`;
}

export function StudentDashboard() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<ExamWithCount[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [startConfirmExam, setStartConfirmExam] = useState<ExamWithCount | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const [e, a] = await Promise.all([
      supabase.from("exams").select("*, subject:subjects(*), class:classes(*)").in("status", ["active", "published"]).order("created_at", { ascending: false }),
      supabase.from("exam_attempts").select("*, exam:exams(title)").eq("student_id", profile?.id ?? ""),
    ]);
    const examList = (e.data as ExamWithCount[]) ?? [];

    const counts = await Promise.all(
      examList.map((exam) =>
        supabase.from("exam_questions").select("id", { count: "exact", head: true }).eq("exam_id", exam.id),
      ),
    );
    const withCounts = examList.map((exam, i) => ({
      ...exam,
      question_count: counts[i]?.count ?? 0,
    }));

    setExams(withCounts);
    setAttempts((a.data as ExamAttempt[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    exams.forEach((e) => {
      if (e.subject?.id && e.subject?.name) map.set(e.subject.id, e.subject.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (subjectFilter !== "all" && exam.subject?.id !== subjectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = exam.title.toLowerCase().includes(q);
        const subjectMatch = exam.subject?.name?.toLowerCase().includes(q);
        if (!titleMatch && !subjectMatch) return false;
      }
      return true;
    });
  }, [exams, searchQuery, subjectFilter]);

  const upcomingExams = useMemo(() => {
    const now = new Date();
    return exams
      .filter((e) => e.start_time && new Date(e.start_time) > now && e.status === "published")
      .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime())
      .slice(0, 4);
  }, [exams]);

  const completed = attempts.filter((a) => a.status === "submitted" || a.status === "auto_submitted").length;
  const inProgress = attempts.filter((a) => a.status === "in_progress").length;

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard Siswa</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Halo, {profile?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Ujian Tersedia" value={exams.length} icon={<FileText size={22} />} color="brand" />
        <StatCard label="Sedang Dikerjakan" value={inProgress} icon={<Clock size={22} />} color="warning" />
        <StatCard label="Ujian Selesai" value={completed} icon={<CheckCircle size={22} />} color="success" />
      </div>

      {upcomingExams.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={20} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Jadwal Ujian Mendatang</h2>
          </div>
          <div className="space-y-3">
            {upcomingExams.map((exam) => {
              const remaining = formatTimeRemaining(exam.start_time);
              return (
                <div key={exam.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{exam.title}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {exam.subject?.name} &middot; {formatDateTime(exam.start_time)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge color="warning"><Timer size={12} /> {remaining}</Badge>
                    <Badge color="slate">{exam.duration_minutes} mnt</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Ujian Tersedia</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9 sm:w-56"
                placeholder="Cari ujian / mapel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                className="input pl-9 sm:w-44 appearance-none cursor-pointer"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                <option value="all">Semua Mapel</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="btn-secondary text-sm px-3 py-2.5 flex-shrink-0"
              title="Muat ulang data"
            >
              {refreshing ? <Spinner size={16} /> : <RefreshCw size={16} />}
            </button>
          </div>
        </div>

        {exams.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="Belum ada ujian"
            description="Ujian dari guru Anda akan muncul di sini."
            action={
              <button onClick={() => loadData(true)} disabled={refreshing} className="btn-secondary text-sm">
                {refreshing ? <Spinner size={16} /> : <RefreshCw size={16} />} Muat Ulang Data
              </button>
            }
          />
        ) : filteredExams.length === 0 ? (
          <EmptyState
            icon={<Search size={28} />}
            title="Tidak ada hasil"
            description="Tidak ada ujian yang cocok dengan pencarian atau filter Anda."
            action={
              <button
                onClick={() => { setSearchQuery(""); setSubjectFilter("all"); }}
                className="btn-secondary text-sm"
              >
                Reset Filter
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredExams.map((exam) => {
              const attempt = attempts.find((a) => a.exam_id === exam.id);
              const isDone = attempt && (attempt.status === "submitted" || attempt.status === "auto_submitted");
              const canResume = attempt && attempt.status === "in_progress";
              const remaining = formatTimeRemaining(exam.end_time);
              const isExpired = exam.end_time ? new Date(exam.end_time) < new Date() : false;

              return (
                <div key={exam.id} className="card p-5 flex flex-col hover:shadow-cardHover transition-all duration-200 hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge color="accent">{exam.subject?.name}</Badge>
                      {exam.status === "active" ? (
                        <Badge color="success"><Play size={12} /> Aktif</Badge>
                      ) : (
                        <Badge color="brand"><Lock size={12} /> Terkunci</Badge>
                      )}
                      {exam.strict_mode && <Badge color="error"><Monitor size={12} /> Strict</Badge>}
                    </div>
                    {isDone && <Badge color="success"><CheckCircle size={12} /> Selesai</Badge>}
                  </div>

                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-snug">{exam.title}</h3>
                  {exam.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{exam.description}</p>}

                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Clock size={14} className="text-slate-400" />
                      <span>{exam.duration_minutes} menit</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <ListChecks size={14} className="text-slate-400" />
                      <span>{exam.question_count ?? 0} soal</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-400 dark:text-slate-500">
                    {exam.start_time && (
                      <div className="flex items-center gap-1.5">
                        <CalendarClock size={12} />
                        <span>Mulai: {formatDateTime(exam.start_time)}</span>
                      </div>
                    )}
                    {exam.end_time && (
                      <div className="flex items-center gap-1.5">
                        <Timer size={12} />
                        <span className={isExpired ? "text-error-500" : ""}>
                          {isExpired ? "Berakhir" : `Sisa: ${remaining}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                    {isDone ? (
                      <button onClick={() => navigate(`/siswa/hasil/${attempt.id}`)} className="btn-secondary w-full text-sm">
                        <Award size={16} /> Lihat Hasil
                      </button>
                    ) : exam.status === "active" && !isExpired ? (
                      <button
                        onClick={() => setStartConfirmExam(exam)}
                        className="btn-primary w-full text-sm"
                      >
                        {canResume ? <><Play size={16} /> Lanjutkan Ujian</> : <><Play size={16} /> Mulai Ujian</>}
                      </button>
                    ) : isExpired ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-2">
                        <Lock size={16} /> Waktu ujian telah berakhir
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-2">
                        <Lock size={16} /> Menunggu diaktifkan
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <StartExamConfirmModal
        exam={startConfirmExam}
        attempt={startConfirmExam ? attempts.find((a) => a.exam_id === startConfirmExam.id) : undefined}
        onClose={() => setStartConfirmExam(null)}
        onConfirm={() => {
          if (startConfirmExam) navigate(`/siswa/ujian/${startConfirmExam.id}`);
          setStartConfirmExam(null);
        }}
      />
    </div>
  );
}

function StartExamConfirmModal({
  exam,
  attempt,
  onClose,
  onConfirm,
}: {
  exam: ExamWithCount | null;
  attempt?: ExamAttempt;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!exam) return null;
  const isResume = attempt?.status === "in_progress";

  return (
    <Modal open={!!exam} onClose={onClose} title={isResume ? "Lanjutkan Ujian" : "Konfirmasi Mulai Ujian"} size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
            <FileText size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{exam.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{exam.subject?.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <Clock size={18} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Durasi</p>
            <p className="font-bold text-slate-700 dark:text-slate-200">{exam.duration_minutes} mnt</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <ListChecks size={18} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Soal</p>
            <p className="font-bold text-slate-700 dark:text-slate-200">{exam.question_count ?? 0}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            {exam.strict_mode ? <Monitor size={18} className="text-error-400 mx-auto mb-1" /> : <EyeOff size={18} className="text-slate-400 mx-auto mb-1" />}
            <p className="text-xs text-slate-500 dark:text-slate-400">Mode</p>
            <p className="font-bold text-slate-700 dark:text-slate-200">{exam.strict_mode ? "Strict" : "Normal"}</p>
          </div>
        </div>

        {exam.strict_mode && (
          <div className="flex items-start gap-2 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 p-3 text-sm text-warning-800 dark:text-warning-300">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Mode Strict aktif</p>
              <p className="text-xs text-warning-700 dark:text-warning-400">Browser fullscreen, dilarang pindah tab (maks. {exam.max_tab_switches}x), copy-paste dinonaktifkan.</p>
            </div>
          </div>
        )}

        {isResume && (
          <div className="flex items-start gap-2 rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 p-3 text-sm text-brand-800 dark:text-brand-300">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <p>Anda memiliki ujian yang sedang berjalan. Klik lanjutkan untuk melanjutkan mengerjakan.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={onConfirm} className="btn-primary">
            {isResume ? <><Play size={18} /> Lanjutkan</> : <><Play size={18} /> Mulai Sekarang</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================
   Student Results
   ============================ */
export function StudentResults() {
  const { profile } = useAuth();
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select("*, exam:exams(title, subject:subjects(name), class:classes(name))")
        .eq("student_id", profile?.id ?? "")
        .in("status", ["submitted", "auto_submitted"])
        .order("submit_time", { ascending: false });
      setAttempts(data as ExamAttempt[] ?? []);
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Nilai Saya</h1>
        <p className="text-sm text-slate-500 mt-1">Riwayat nilai ujian</p>
      </div>
      {attempts.length === 0 ? (
        <EmptyState icon={<Award size={28} />} title="Belum ada nilai" description="Hasil ujian Anda akan muncul di sini." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Ujian</th>
              <th className="px-4 py-3 font-medium">Mapel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Nilai Otomatis</th>
              <th className="px-4 py-3 font-medium">Nilai Akhir</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.exam?.title}</td>
                  <td className="px-4 py-3 text-slate-600">{a.exam?.subject?.name}</td>
                  <td className="px-4 py-3"><Badge color={a.status === "submitted" ? "success" : "error"}>{a.status === "submitted" ? "Selesai" : "Auto-Submit"}</Badge></td>
                  <td className="px-4 py-3 text-slate-700">{a.auto_score} / {a.max_score}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{a.final_score ?? "Menunggu Koreksi"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StudentResultDetail({ attemptId }: { attemptId: string }) {
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [att, ans] = await Promise.all([
        supabase.from("exam_attempts").select("*, exam:exams(title, subject:subjects(name))").eq("id", attemptId).maybeSingle(),
        supabase.from("answers").select("*, question:questions(content, type, options, points)").eq("attempt_id", attemptId),
      ]);
      setAttempt(att.data as ExamAttempt | null);
      setAnswers(ans.data ?? []);
      setLoading(false);
    })();
  }, [attemptId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (!attempt) return <EmptyState icon={<AlertTriangle size={28} />} title="Hasil tidak ditemukan" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={() => navigate("/siswa/nilai")} className="text-sm text-brand-600 font-medium hover:underline">&larr; Kembali</button>
      <div className="card p-6">
        <h1 className="text-2xl font-bold text-slate-800">{attempt.exam?.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{attempt.exam?.subject?.name}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="text-center p-4 rounded-xl bg-brand-50">
            <p className="text-xs text-slate-500">Nilai Otomatis</p>
            <p className="text-2xl font-bold text-brand-700 mt-1">{attempt.auto_score}</p>
            <p className="text-xs text-slate-400">/ {attempt.max_score}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-accent-50">
            <p className="text-xs text-slate-500">Nilai Uraian</p>
            <p className="text-2xl font-bold text-accent-700 mt-1">{attempt.essay_score ?? "-"}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-success-50">
            <p className="text-xs text-slate-500">Nilai Akhir</p>
            <p className="text-2xl font-bold text-success-700 mt-1">{attempt.final_score ?? "Menunggu"}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-slate-50">
            <p className="text-xs text-slate-500">Status</p>
            <p className="text-sm font-bold text-slate-700 mt-2"><Badge color={attempt.status === "submitted" ? "success" : "error"}>{attempt.status === "submitted" ? "Selesai" : "Auto-Submit"}</Badge></p>
            {attempt.tab_switches > 0 && <p className="text-xs text-error-500 mt-1">{attempt.tab_switches}x tab switch</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   CBT Exam Interface
   ============================ */
export function StudentExam({ examId }: { examId: string }) {
  const { profile } = useAuth();
  const [examData, setExamData] = useState<StudentExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [examMeta, setExamMeta] = useState<{ requires_token: boolean; start_time: string | null; end_time: string | null; title: string; description: string | null; duration_minutes: number; strict_mode: boolean; max_tab_switches: number } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [fetchingExam, setFetchingExam] = useState(false);

  // Step 1: fetch exam metadata (without answer keys) and whether a token is required
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("title, description, duration_minutes, strict_mode, max_tab_switches, start_time, end_time")
        .eq("id", examId)
        .maybeSingle();
      if (error) {
        setError("Gagal memuat informasi ujian.");
        setLoading(false);
        return;
      }
      if (!data) {
        setError("Ujian tidak ditemukan.");
        setLoading(false);
        return;
      }
      const { data: requiresToken, error: tokenCheckError } = await supabase.rpc("exam_requires_token", { p_exam_id: examId });
      if (tokenCheckError || typeof requiresToken !== "boolean") {
        setError("Gagal memuat informasi ujian.");
        setLoading(false);
        return;
      }
      setExamMeta({ ...data, requires_token: requiresToken } as any);
      setLoading(false);
    })();
  }, [examId]);

  const fetchExamWithToken = async (token: string | null) => {
    setFetchingExam(true);
    setTokenError(null);
    try {
      const gatewayUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exam-gateway`;
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          exam_id: examId,
          access_token: token,
          strict_mode: examMeta?.strict_mode ?? true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error ?? "Gagal memuat ujian.";
        if (msg.includes("token") || msg.includes("Token")) {
          setTokenError("Token akses salah. Periksa kembali token dari guru Anda.");
        } else if (msg.includes("jaringan sekolah")) {
          setTokenError(msg);
        } else if (msg.includes("Safe Exam Browser")) {
          setTokenError(msg);
        } else if (msg.includes("belum") || msg.includes("not") && msg.includes("start")) {
          setTokenError("Ujian belum dimulai. Tunggu hingga jadwal mulai.");
        } else if (msg.includes("selesai") || msg.includes("ended") || msg.includes("end") || msg.includes("berakhir")) {
          setTokenError("Ujian sudah berakhir. Anda tidak dapat mengakses soal lagi.");
        } else {
          setTokenError(msg);
        }
        setFetchingExam(false);
        return;
      }
      const rows = json?.data ?? [];
      const parsed = parseStudentExam(rows as any[]);
      if (!parsed) {
        setTokenError("Ujian tidak ditemukan atau Anda tidak memiliki akses.");
        setFetchingExam(false);
        return;
      }
      setExamData(parsed);
      setFetchingExam(false);
    } catch {
      setTokenError("Gagal terhubung ke server ujian. Periksa koneksi Anda.");
      setFetchingExam(false);
    }
  };

  const handleTokenSubmit = () => {
    if (!tokenInput.trim()) {
      setTokenError("Masukkan token akses terlebih dahulu.");
      return;
    }
    fetchExamWithToken(tokenInput.trim().toUpperCase());
  };

  const handleStartWithoutToken = () => {
    fetchExamWithToken(null);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertTriangle size={40} className="text-error-400" />
      <p className="mt-4 text-slate-600">{error}</p>
      <button onClick={() => navigate("/siswa")} className="btn-secondary mt-4">Kembali</button>
    </div>
  );
  if (!examMeta) return null;

  // Step 2: if exam requires token and we haven't loaded the exam yet, show token entry screen
  if (!examData && examMeta.requires_token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="card p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
                <Key size={32} />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">{examMeta.title}</h1>
              <p className="text-slate-500 mt-2">Ujian ini memerlukan token akses untuk membuka soal.</p>
            </div>
            <div>
              <label className="label">Token Akses</label>
              <input
                className="input font-mono uppercase tracking-widest text-center text-lg"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                placeholder="MASUKKAN TOKEN"
                maxLength={20}
                onKeyDown={(e) => { if (e.key === "Enter") handleTokenSubmit(); }}
                autoFocus
              />
              {tokenError && (
                <div className="mt-3 rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{tokenError}</span>
                </div>
              )}
              <button onClick={handleTokenSubmit} disabled={fetchingExam} className="btn-primary w-full mt-4">
                {fetchingExam ? <Spinner size={18} /> : <Lock size={18} />} Buka Ujian
              </button>
              <button onClick={() => navigate("/siswa")} className="btn-ghost w-full mt-2 text-sm">Kembali</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2b: no token required — fetch exam directly
  if (!examData && !examMeta.requires_token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="card p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
              <FileText size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{examMeta.title}</h1>
            <p className="text-slate-500 mt-2 mb-6">Menyiapkan soal ujian...</p>
            <button onClick={handleStartWithoutToken} disabled={fetchingExam} className="btn-primary w-full">
              {fetchingExam ? <Spinner size={18} /> : <Play size={18} />} Lanjutkan
            </button>
            {tokenError && (
              <div className="mt-3 rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{tokenError}</div>
            )}
            <button onClick={() => navigate("/siswa")} className="btn-ghost w-full mt-2 text-sm">Kembali</button>
          </div>
        </div>
      </div>
    );
  }

  if (!examData) return null;
  if (!started) {
    return <ExamStartScreen examData={examData} studentName={profile?.full_name ?? ""} onStart={() => setStarted(true)} />;
  }

  return <ExamRunner examData={examData} />;
}

function ExamStartScreen({ examData, studentName, onStart }: {
  examData: StudentExamData;
  studentName: string;
  onStart: () => void;
}) {
  const { exam } = examData;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="card p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
              <FileText size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{exam.title}</h1>
            {exam.description && <p className="text-slate-500 mt-2">{exam.description}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="text-center p-4 rounded-xl bg-slate-50">
              <Clock size={20} className="text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Durasi</p>
              <p className="font-bold text-slate-700">{exam.duration_minutes} mnt</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-slate-50">
              <FileText size={20} className="text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Soal</p>
              <p className="font-bold text-slate-700">{examData.questions.length}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-slate-50">
              {exam.strict_mode ? <Lock size={20} className="text-error-400 mx-auto mb-1" /> : <EyeOff size={20} className="text-slate-400 mx-auto mb-1" />}
              <p className="text-xs text-slate-500">Mode</p>
              <p className="font-bold text-slate-700">{exam.strict_mode ? "Strict" : "Normal"}</p>
            </div>
          </div>

          {exam.strict_mode && (
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-warning-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-warning-800">
                  <p className="font-semibold mb-1">Peraturan Ujian (Strict Mode)</p>
                  <ul className="list-disc list-inside space-y-1 text-warning-700">
                    <li>Browser akan masuk mode fullscreen</li>
                    <li>Dilarang berpindah tab / aplikasi (maks. {exam.max_tab_switches}x, setelah itu auto-submit)</li>
                    <li>Klik kanan, copy-paste, dan print dinonaktifkan</li>
                    <li>Jawaban tersimpan otomatis dan tahan gangguan sinyal</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-brand-50 p-4 mb-6">
            <p className="text-sm text-brand-800">
              <span className="font-semibold">Peserta:</span> {studentName}
            </p>
          </div>

          <button onClick={onStart} className="btn-primary w-full text-base py-3">
            <Play size={20} /> Mulai Ujian
          </button>
        </div>
      </div>
    </div>
  );
}

function ExamRunner({ examData }: { examData: StudentExamData }) {
  const { exam, questions, attemptId } = examData;
  const { profile } = useAuth();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(exam.duration_minutes * 60);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [submitRetrying, setSubmitRetrying] = useState(false);
  const storageKey = localDraftKey(profile?.id ?? "", exam.id);
  const { answers, setAnswer, status: saveStatus, saveAll } = useAnswerAutosave({
    storageKey,
    attemptId,
    sessionToken: examData.sessionToken,
    enabled: !submitted,
  });

  // Timer
  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [submitted]);

  // Anti-cheat: fullscreen + keyboard shortcuts + context menu + visibility
  useEffect(() => {
    if (!exam.strict_mode) return;

    const enterFullscreen = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };
    enterFullscreen();

    const preventContext = (e: Event) => e.preventDefault();
    const preventCopy = (e: ClipboardEvent) => e.preventDefault();
    const preventKey = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) || (e.ctrlKey && e.key === "u")) {
        e.preventDefault();
      }
      if (e.ctrlKey && (e.key === "c" || e.key === "v" || e.key === "a" || e.key === "p" || e.key === "s")) {
        e.preventDefault();
      }
    };
    const onSelectStart = (e: Event) => e.preventDefault();
    const onVisibility = async () => {
      if (document.hidden) {
        const count = tabSwitchCount + 1;
        setTabSwitchCount(count);
        setShowTabWarning(true);
        const { data } = await supabase.rpc("increment_tab_switches", { p_attempt_id: attemptId });
        const result = data as any;
        if (result?.[0]?.out_auto_submit) {
          setAutoSubmitted(true);
          handleSubmit();
        }
        await supabase.from("audit_logs").insert({
          attempt_id: attemptId, student_id: null, event_type: "tab_switch",
          details: { count },
        });
      }
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    document.addEventListener("contextmenu", preventContext);
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("paste", preventCopy);
    document.addEventListener("keydown", preventKey);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("contextmenu", preventContext);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("paste", preventCopy);
      document.removeEventListener("keydown", preventKey);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [exam.strict_mode, attemptId, tabSwitchCount]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitRetrying(false);

    const saved = await saveAll(() => setSubmitRetrying(true));
    if (!saved.ok) {
      setSubmitError(saved.message);
      setSubmitting(false);
      setSubmitRetrying(false);
      return;
    }

    const finished = await retryWhileOffline(() => submitAttempt(attemptId, examData.sessionToken), () => setSubmitRetrying(true));
    if (!finished.ok) {
      setSubmitError(finished.message);
      setSubmitting(false);
      setSubmitRetrying(false);
      return;
    }

    clearLocalDraft(storageKey);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setSubmitted(true);
    setSubmitting(false);
    setSubmitRetrying(false);
  };

  // Success screen
  if (submitted || autoSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="card p-8 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${autoSubmitted ? "bg-error-100 text-error-600" : "bg-success-100 text-success-600"}`}>
              {autoSubmitted ? <AlertTriangle size={40} /> : <CheckCircle size={40} />}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">
              {autoSubmitted ? "Ujian Auto-Submit" : "Ujian Selesai"}
            </h1>
            <p className="text-slate-500 mt-2">
              {autoSubmitted
                ? "Ujian Anda telah dikirim otomatis karena melebihi batas pelanggaran tab."
                : "Terima kasih! Jawaban Anda telah berhasil dikirim dan diverifikasi."}
            </p>
            <div className="mt-6 p-4 rounded-xl bg-slate-50">
              <p className="text-sm text-slate-500">Ujian</p>
              <p className="font-semibold text-slate-800">{exam.title}</p>
            </div>
            <button onClick={() => navigate("/siswa")} className="btn-primary w-full mt-6">
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submitting loading
  if (submitting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-brand-500 mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Mengirim jawaban & memverifikasi data...</p>
          <p className="text-sm text-slate-400 mt-1">
            {submitRetrying ? "Koneksi tidak stabil, mencoba mengirim ulang..." : "Mohon tunggu, jangan tutup halaman ini"}
          </p>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const unansweredCount = questions.length - answeredCount;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeColor = timeLeft < 60 ? "text-error-600" : timeLeft < 300 ? "text-warning-600" : "text-slate-700";

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-brand-600" />
          <div>
            <h1 className="text-sm font-semibold text-slate-800">{exam.title}</h1>
            <p className="text-xs text-slate-400">{answeredCount} / {questions.length} terjawab</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isOnline && (
            <Badge color="error"><WifiOff size={12} /> Offline</Badge>
          )}
          {isOnline && <Badge color="success"><Wifi size={12} /> Online</Badge>}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 ${timeColor}`}>
            <Clock size={16} />
            <span className="font-mono font-bold text-sm tabular-nums">{mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}</span>
          </div>
          <button onClick={() => setShowSubmitConfirm(true)} className="btn-danger text-sm px-4 py-1.5">
            Selesai
          </button>
        </div>
      </header>

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-warning-500 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff size={16} /> Koneksi terputus. Jawaban tersimpan lokal & akan tersinkron otomatis saat sinyal kembali.
        </div>
      )}

      {/* Tab switch warning */}
      {showTabWarning && (
        <div className="bg-error-500 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-2">
          <AlertTriangle size={16} />
          Peringatan: Anda berpindah tab ({tabSwitchCount}/{exam.max_tab_switches}). Melampaui batas akan auto-submit ujian!
          <button onClick={() => setShowTabWarning(false)} className="ml-2 underline text-xs">Tutup</button>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full p-4 gap-4">
        {/* Question area */}
        <div className="flex-1 card p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-400">Soal {currentIdx + 1} dari {questions.length}</span>
              <Badge color="brand">{QUESTION_TYPE_LABELS[currentQ.type]}</Badge>
              <Badge color="warning">{currentQ.points} poin</Badge>
            </div>
          </div>

          <div className="prose prose-slate max-w-none space-y-4">
            {currentQ.imageUrl && (
              <img src={currentQ.imageUrl} alt="Gambar soal" className="mx-auto max-h-72 rounded-lg border border-slate-200 bg-white object-contain" />
            )}
            <p className="text-base text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">{currentQ.content}</p>
          </div>

          <div className="mt-6">
            <AnswerInput
              type={currentQ.type}
              options={currentQ.options}
              value={answers[currentQ.id]}
              onChange={(val) => setAnswer(currentQ.id, val)}
            />
          </div>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="btn-secondary"
            >
              <ChevronLeft size={18} /> Sebelumnya
            </button>
            {currentIdx < questions.length - 1 ? (
              <button onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))} className="btn-primary">
                Selanjutnya <ChevronRight size={18} />
              </button>
            ) : (
              <button onClick={() => setShowSubmitConfirm(true)} className="btn-danger">
                <Flag size={18} /> Selesai
              </button>
            )}
          </div>
        </div>

        {/* Navigation grid */}
        <div className="lg:w-64 card p-4 h-fit">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Navigasi Soal</h3>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, i) => {
              const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "" && !(Array.isArray(answers[q.id]) && answers[q.id].length === 0);
              const isCurrent = i === currentIdx;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentIdx(i)}
                  className={`aspect-square rounded-lg text-sm font-medium transition ${
                    isCurrent
                      ? "bg-brand-600 text-white ring-2 ring-brand-300"
                      : isAnswered
                      ? "bg-success-100 text-success-700 hover:bg-success-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-success-100" /> Terjawab</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-slate-100" /> Belum</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-brand-600" /> Aktif</div>
          </div>
        </div>
      </div>

      {/* Submit confirmation */}
      <AutosaveIndicator status={saveStatus} />

      <Modal open={showSubmitConfirm} onClose={() => setShowSubmitConfirm(false)} title="Konfirmasi Selesai" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Soal</span>
              <span className="font-semibold text-slate-800">{questions.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Terjawab</span>
              <span className="font-semibold text-success-600">{answeredCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Belum Terjawab</span>
              <span className="font-semibold text-error-600">{unansweredCount}</span>
            </div>
          </div>
          {unansweredCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <p>Masih ada {unansweredCount} soal yang belum dijawab. Yakin ingin mengirim?</p>
            </div>
          )}
          {submitError && (
            <div className="rounded-lg bg-error-50 border border-error-200 p-3 text-sm text-error-700">{submitError}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowSubmitConfirm(false)} className="btn-secondary">Lanjut Ujian</button>
            <button onClick={() => handleSubmit()} className="btn-danger">
              Ya, Kirim Jawaban
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const SAVE_STATUS_VIEW: Record<SaveStatus, { label: string; icon: typeof Check; className: string; spin?: boolean }> = {
  saved: { label: "Jawaban tersimpan", icon: Check, className: "text-success-700" },
  saving: { label: "Menyimpan...", icon: Loader2, className: "text-slate-600", spin: true },
  pending: { label: "Perubahan belum terkirim", icon: CloudUpload, className: "text-slate-600" },
  offline: { label: "Koneksi tidak stabil, dicoba lagi otomatis", icon: CloudOff, className: "text-warning-700" },
  error: { label: "Gagal menyimpan, dicoba lagi otomatis", icon: CloudOff, className: "text-error-700" },
};

function AutosaveIndicator({ status }: { status: SaveStatus }) {
  const view = SAVE_STATUS_VIEW[status];
  const Icon = view.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-white border border-slate-200 shadow-md px-3 py-1.5 text-xs font-medium pointer-events-none transition-colors duration-300 ${view.className}`}
    >
      <Icon size={14} className={view.spin ? "animate-spin" : undefined} />
      {view.label}
    </div>
  );
}

function AnswerInput({ type, options, value, onChange }: {
  type: QuestionType;
  options: QuestionOption[];
  value: any;
  onChange: (val: any) => void;
}) {
  const opts = options.map(normalizeOption);
  // Store answers using each option's ORIGINAL index (oi) so grading compares
  // against the teacher's stored key, not the shuffled on-screen position.
  const orig = (i: number) => opts[i].oi ?? i;
  if (type === "pg") {
    return (
      <div className="space-y-2">
        {opts.map((opt, i) => (
          <label
            key={i}
            className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
              value === orig(i) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input type="radio" name="pg-answer" checked={value === orig(i)} onChange={() => onChange(orig(i))} className="mt-1 text-brand-600" />
            <div className="flex-1 space-y-2">
              <span className="text-sm text-slate-700 whitespace-pre-wrap"><span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{opt.text}</span>
              {opt.image_url && <img src={opt.image_url} alt="Opsi" className="max-h-32 rounded-md border border-slate-200 bg-white object-contain" />}
            </div>
          </label>
        ))}
      </div>
    );
  }

  if (type === "pg_kompleks") {
    // Store booleans keyed by each statement's ORIGINAL index so shuffled
    // display order never corrupts grading.
    const size = Math.max(opts.length, ...opts.map((_, i) => orig(i) + 1));
    const stored: boolean[] = Array.isArray(value) ? value : [];
    const answeredAt = (i: number) => stored[orig(i)];
    const setAt = (i: number, v: boolean) => {
      const a: boolean[] = new Array(size).fill(false);
      for (let k = 0; k < size; k++) a[k] = stored[k] ?? false;
      a[orig(i)] = v;
      onChange(a);
    };
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500 mb-2">Tentukan pernyataan Benar atau Salah:</p>
        {opts.map((opt, i) => (
          <div key={i} className="p-3.5 rounded-xl border-2 border-slate-200">
            <div className="space-y-2">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{opt.text}</p>
              {opt.image_url && <img src={opt.image_url} alt="Pernyataan" className="max-h-32 rounded-md border border-slate-200 bg-white object-contain" />}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setAt(i, true)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                  answeredAt(i) === true ? "bg-success-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >Benar</button>
              <button
                onClick={() => setAt(i, false)}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                  answeredAt(i) === false ? "bg-error-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >Salah</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "mcma") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-500 mb-2">Centang semua jawaban yang benar:</p>
        {opts.map((opt, i) => (
          <label
            key={i}
            className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
              selected.includes(orig(i)) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(orig(i))}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, orig(i)].sort((a, b) => a - b));
                else onChange(selected.filter((x) => x !== orig(i)));
              }}
              className="mt-1 text-brand-600"
            />
            <div className="flex-1 space-y-2">
              <span className="text-sm text-slate-700 whitespace-pre-wrap"><span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{opt.text}</span>
              {opt.image_url && <img src={opt.image_url} alt="Opsi" className="max-h-32 rounded-md border border-slate-200 bg-white object-contain" />}
            </div>
          </label>
        ))}
      </div>
    );
  }

  // uraian
  return (
    <textarea
      className="input min-h-[160px] font-sans"
      placeholder="Tulis jawaban Anda di sini..."
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

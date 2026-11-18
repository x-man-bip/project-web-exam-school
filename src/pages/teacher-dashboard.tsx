import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, CalendarClock, Play, AlertCircle, Plus, PenLine, Radio,
  TrendingUp, History, CheckCircle, ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { navigate } from "@/lib/router";
import { StatCard, Badge, Spinner, EmptyState } from "@/components/ui";
import { one, formatClock, formatRemaining } from "@/components/dashboard/dashboardFormat";

const REFRESH_MS = 30000;
const CHART_EXAM_LIMIT = 6;

interface RawExam {
  id: string;
  title: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  class_id: string | null;
  class_level: string | null;
  subject: { name: string } | { name: string }[] | null;
  class: { name: string } | { name: string }[] | null;
}

interface RawAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  start_time: string;
  submit_time: string | null;
  final_score: number | null;
  max_score: number;
  student: { full_name: string } | { full_name: string }[] | null;
}

interface RawEssayExam {
  title: string;
  class_level: string | null;
  class: { name: string } | { name: string }[] | null;
}

interface RawEssayAttempt {
  submit_time: string | null;
  student: { full_name: string } | { full_name: string }[] | null;
  exam: RawEssayExam | RawEssayExam[] | null;
}

interface RawEssay {
  id: string;
  attempt: RawEssayAttempt | RawEssayAttempt[] | null;
}

interface ExamView {
  id: string;
  title: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  classLabel: string;
  subjectName: string;
  classId: string | null;
}

interface AttemptView {
  id: string;
  examId: string;
  studentName: string;
  status: string;
  submitTime: string | null;
  percent: number | null;
}

interface EssayView {
  id: string;
  studentName: string;
  examTitle: string;
  classLabel: string;
  submitTime: string | null;
}

interface ActivityItem {
  id: string;
  text: string;
  time: string;
}

function classLabelOf(exam: { class: { name: string } | { name: string }[] | null; class_level: string | null }) {
  const cls = one(exam.class);
  if (cls) return cls.name;
  return exam.class_level ? `Kelas ${exam.class_level}` : "-";
}

function remainingEnd(exam: ExamView): number | null {
  if (exam.end_time) return new Date(exam.end_time).getTime();
  if (exam.start_time) return new Date(exam.start_time).getTime() + exam.duration_minutes * 60 * 1000;
  return null;
}

export function TeacherDashboard() {
  const { profile } = useAuth();
  const [questionCount, setQuestionCount] = useState(0);
  const [exams, setExams] = useState<ExamView[]>([]);
  const [attempts, setAttempts] = useState<AttemptView[]>([]);
  const [enrolledByClass, setEnrolledByClass] = useState<Record<string, number>>({});
  const [essays, setEssays] = useState<EssayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;

    const [qRes, examRes] = await Promise.all([
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("teacher_id", profile.id),
      supabase
        .from("exams")
        .select("id, title, status, start_time, end_time, duration_minutes, class_id, class_level, subject:subjects(name), class:classes(name)")
        .eq("teacher_id", profile.id)
        .order("start_time", { ascending: false }),
    ]);

    if (qRes.error || examRes.error) {
      setError("Data dashboard belum bisa dimuat.");
      setLoading(false);
      return;
    }

    const rawExams = (examRes.data ?? []) as unknown as RawExam[];
    const examViews: ExamView[] = rawExams.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      start_time: e.start_time,
      end_time: e.end_time,
      duration_minutes: e.duration_minutes,
      classLabel: classLabelOf(e),
      subjectName: one(e.subject)?.name ?? "-",
      classId: e.class_id,
    }));
    const examIds = examViews.map((e) => e.id);
    const classIds = [...new Set(examViews.map((e) => e.classId).filter((id): id is string => !!id))];

    setQuestionCount(qRes.count ?? 0);
    setExams(examViews);

    if (examIds.length === 0) {
      setAttempts([]);
      setEnrolledByClass({});
      setEssays([]);
      setError(null);
      setLoading(false);
      return;
    }

    const [attemptRes, essayRes, enrollRes] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("id, exam_id, student_id, status, start_time, submit_time, final_score, max_score, student:profiles!student_id(full_name)")
        .in("exam_id", examIds)
        .order("start_time", { ascending: false })
        .limit(1000),
      supabase
        .from("answers")
        .select("id, attempt:exam_attempts!inner(submit_time, student:profiles!student_id(full_name), exam:exams!inner(title, class_id, class_level, class:classes(name), teacher_id)), question:questions!inner(type)")
        .eq("graded", false)
        .eq("question.type", "uraian")
        .eq("attempt.exam.teacher_id", profile.id)
        .order("created_at", { ascending: true })
        .limit(50),
      classIds.length
        ? supabase.from("class_enrollments").select("class_id").in("class_id", classIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (attemptRes.error || essayRes.error || enrollRes.error) {
      setError("Data dashboard belum bisa dimuat.");
      setLoading(false);
      return;
    }

    const examTitle = new Map(examViews.map((e) => [e.id, e.title]));
    const rawAttempts = (attemptRes.data ?? []) as unknown as RawAttempt[];
    setAttempts(
      rawAttempts.map((a) => ({
        id: a.id,
        examId: a.exam_id,
        studentName: one(a.student)?.full_name ?? "-",
        status: a.status,
        submitTime: a.submit_time,
        percent: a.final_score !== null && a.max_score > 0 ? (a.final_score / a.max_score) * 100 : null,
      })),
    );

    const enrolled: Record<string, number> = {};
    for (const row of (enrollRes.data ?? []) as { class_id: string }[]) {
      enrolled[row.class_id] = (enrolled[row.class_id] ?? 0) + 1;
    }
    setEnrolledByClass(enrolled);

    const rawEssays = (essayRes.data ?? []) as unknown as RawEssay[];
    setEssays(
      rawEssays.map((row) => {
        const attempt = one(row.attempt);
        const exam = one(attempt?.exam ?? null);
        return {
          id: row.id,
          studentName: one(attempt?.student ?? null)?.full_name ?? "-",
          examTitle: exam?.title ?? "-",
          classLabel: exam ? classLabelOf({ class: exam.class, class_level: exam.class_level }) : "-",
          submitTime: attempt?.submit_time ?? null,
        };
      }),
    );

    setError(null);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    return () => clearInterval(refresh);
  }, [load]);

  const activeExams = useMemo(
    () => exams.filter((e) => e.status === "active"),
    [exams],
  );

  const liveRows = useMemo(
    () => activeExams.map((exam) => {
      const mine = attempts.filter((a) => a.examId === exam.id);
      const working = mine.filter((a) => a.status === "in_progress").length;
      const total = exam.classId ? (enrolledByClass[exam.classId] ?? mine.length) : mine.length;
      const end = remainingEnd(exam);
      return { exam, working, total, remainingMs: end === null ? null : end - now };
    }),
    [activeExams, attempts, enrolledByClass, now],
  );

  const trend = useMemo(() => {
    const byExam = new Map<string, { title: string; start: string; scores: number[] }>();
    for (const exam of exams) {
      if (!exam.start_time) continue;
      byExam.set(exam.id, { title: exam.title, start: exam.start_time, scores: [] });
    }
    for (const a of attempts) {
      if (a.percent === null) continue;
      byExam.get(a.examId)?.scores.push(a.percent);
    }
    return [...byExam.values()]
      .filter((x) => x.scores.length > 0)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(-CHART_EXAM_LIMIT)
      .map((x) => ({
        title: x.title,
        average: x.scores.reduce((s, v) => s + v, 0) / x.scores.length,
      }));
  }, [exams, attempts]);

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const a of attempts) {
      if (!a.submitTime || a.status === "in_progress" || a.status === "not_started") continue;
      const exam = exams.find((e) => e.id === a.examId);
      const verb = a.status === "auto_submitted" ? "terputus dan dikumpulkan otomatis" : "telah menyelesaikan";
      items.push({ id: `s-${a.id}`, text: `${a.studentName} ${verb} ${exam?.title ?? "ujian"}`, time: a.submitTime });
    }
    for (const exam of exams) {
      if (!exam.end_time) continue;
      if (new Date(exam.end_time).getTime() <= now) {
        items.push({ id: `e-${exam.id}`, text: `${exam.title} telah berakhir`, time: exam.end_time });
      }
    }
    return items.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 12);
  }, [attempts, exams, now]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const stats = {
    questions: questionCount,
    exams: exams.length,
    active: exams.filter((e) => e.status === "active" || e.status === "published").length,
    pendingEssays: essays.length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard Guru</h1>
        <p className="text-base text-slate-500 mt-1">Selamat datang, {profile?.full_name}</p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Aksi Cepat</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate("/guru/soal")} className="btn-primary">
            <Plus size={18} /> Buat Soal Baru
          </button>
          <button onClick={() => navigate("/guru/ujian")} className="btn-secondary">
            <Plus size={18} /> Buat Ujian
          </button>
          <button onClick={() => navigate("/guru/koreksi")} className="btn-secondary">
            <PenLine size={18} /> Koreksi Uraian
            {stats.pendingEssays > 0 && <Badge color="warning">{stats.pendingEssays}</Badge>}
          </button>
        </div>
      </section>

      {error && <div className="rounded-lg border px-4 py-3 text-sm bg-error-50 border-error-200 text-error-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Bank Soal" value={stats.questions} icon={<BookOpen size={22} />} color="brand" />
        <StatCard label="Total Ujian" value={stats.exams} icon={<CalendarClock size={22} />} color="accent" />
        <StatCard label="Ujian Aktif" value={stats.active} icon={<Play size={22} />} color="success" />
        <StatCard label="Perlu Koreksi" value={stats.pendingEssays} icon={<AlertCircle size={22} />} color="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <section className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
              </span>
              <h2 className="text-lg font-semibold text-slate-800">Ujian Sedang Berlangsung</h2>
            </div>
            {liveRows.length === 0 ? (
              <EmptyState icon={<Radio size={24} />} title="Tidak ada ujian berlangsung" description="Ujian yang sedang diaktifkan akan tampil di sini." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-4 py-2.5 font-semibold">Nama Ujian</th>
                      <th className="px-4 py-2.5 font-semibold">Kelas</th>
                      <th className="px-4 py-2.5 font-semibold">Mapel</th>
                      <th className="px-4 py-2.5 font-semibold">Siswa</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Sisa Waktu</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liveRows.map(({ exam, working, total, remainingMs }) => (
                      <tr key={exam.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{exam.title}</td>
                        <td className="px-4 py-3 text-slate-600">{exam.classLabel}</td>
                        <td className="px-4 py-3 text-slate-600">{exam.subjectName}</td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{working}/{total} Siswa Mengerjakan</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                          {remainingMs === null ? "-" : formatRemaining(remainingMs)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => navigate("/guru/ujian")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 transition">
                            Pantau Real-time <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">Perlu Koreksi Uraian</h2>
              {essays.length > 0 && <Badge color="warning">{essays.length} menunggu</Badge>}
            </div>
            {essays.length === 0 ? (
              <EmptyState icon={<CheckCircle size={24} />} title="Semua uraian sudah dikoreksi" description="Jawaban uraian siswa yang belum dinilai akan muncul di sini." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {essays.slice(0, 5).map((essay) => (
                  <li key={essay.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{essay.studentName}</p>
                      <p className="text-xs text-slate-500">
                        {essay.examTitle} · {essay.classLabel}
                        {essay.submitTime && ` · ${new Date(essay.submitTime).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`}
                      </p>
                    </div>
                    <button onClick={() => navigate("/guru/koreksi")} className="btn-primary text-sm py-2">
                      Koreksi Sekarang
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-800">Rata-rata Nilai Ujian Terbaru</h2>
            </div>
            {trend.length === 0 ? (
              <EmptyState icon={<TrendingUp size={24} />} title="Belum ada nilai" description="Grafik akan muncul setelah siswa menyelesaikan ujian." />
            ) : (
              <TrendChart points={trend} />
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <History size={20} className="text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-800">Aktivitas Terbaru</h2>
            </div>
            {activity.length === 0 ? (
              <EmptyState icon={<History size={24} />} title="Belum ada aktivitas" description="Siswa yang menyelesaikan ujian akan tercatat di sini." />
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
                {activity.map((item) => (
                  <li key={item.id} className="py-2.5 space-y-0.5">
                    <p className="text-sm text-slate-700">{item.text}</p>
                    <p className="text-xs text-slate-400 tabular-nums">
                      {new Date(item.time).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} · {formatClock(item.time)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: { title: string; average: number }[] }) {
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 40, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i: number) => pad.left + (points.length > 1 ? i * step : innerW / 2);
  const y = (v: number) => pad.top + innerH - (v / 100) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.average)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[480px]" role="img" aria-label="Grafik rata-rata nilai">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray="4 4" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{tick}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.average)} r={5} fill="#fff" stroke="#2563eb" strokeWidth={2.5}>
              <title>{`${p.title}: ${p.average.toFixed(1)}`}</title>
            </circle>
            <text x={x(i)} y={y(p.average) - 12} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">{p.average.toFixed(0)}</text>
            <text x={x(i)} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Activity, CheckCircle2, AlertTriangle, Wifi, WifiOff,
  RotateCcw, Flag, Monitor, Filter,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchTeacherClasses } from "@/lib/teacherClasses";
import { type ClassRoom } from "@/lib/types";
import { StatCard, Badge, EmptyState, Spinner } from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { formatRemaining, one, startOfToday } from "@/components/dashboard/dashboardFormat";

const REFRESH_MS = 10000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

interface RawAttempt {
  id: string;
  status: string;
  start_time: string;
  submit_time: string | null;
  tab_switches: number;
  student_id: string;
  exam_id: string;
  student: { full_name: string; identifier: string | null } | { full_name: string; identifier: string | null }[] | null;
  exam: {
    duration_minutes: number;
    title: string;
    question_count: number;
    subject: { name: string } | { name: string }[] | null;
  } | { duration_minutes: number; title: string; question_count: number; subject: { name: string } | { name: string }[] | null }[] | null;
}

interface MonitorRow {
  id: string;
  status: string;
  start_time: string;
  submit_time: string | null;
  tab_switches: number;
  student_id: string;
  exam_id: string;
  student_name: string;
  student_nis: string;
  exam_title: string;
  subject_name: string;
  question_count: number;
  duration_minutes: number;
  deadline: number;
  answeredCount: number;
}

interface ActiveExam {
  id: string;
  title: string;
  subject_name: string;
  class_name: string | null;
  class_level: string | null;
}

export function ExamMonitoring() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "super_admin";
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [activeExams, setActiveExams] = useState<ActiveExam[]>([]);
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [classByStudent, setClassByStudent] = useState<Record<string, string>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filterClass, setFilterClass] = useState("");
  const [filterExam, setFilterExam] = useState("");
  const [resetTarget, setResetTarget] = useState<MonitorRow | null>(null);
  const [forceTarget, setForceTarget] = useState<MonitorRow | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const cls = isAdmin
        ? await supabase.from("classes").select("*").order("name").then((r) => (r.data as ClassRoom[]) ?? [])
        : await fetchTeacherClasses(profile.id);
      setClasses(cls);
    })();
  }, [profile, isAdmin]);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);

    let examQuery = supabase
      .from("exams")
      .select("id, title, class_id, class_level, subject:subjects(name), class:classes(name)")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (!isAdmin) examQuery = examQuery.eq("teacher_id", profile.id);
    const { data: examData } = await examQuery;

    const exams: ActiveExam[] = ((examData ?? []) as unknown as any[]).map((e) => ({
      id: e.id,
      title: e.title,
      subject_name: one(e.subject)?.name ?? "-",
      class_name: one(e.class)?.name ?? null,
      class_level: e.class_level ?? null,
    }));
    setActiveExams(exams);

    const examIds = exams.map((e) => e.id);
    if (examIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: attemptData, error: attemptError } = await supabase
      .from("exam_attempts")
      .select("id, status, start_time, submit_time, tab_switches, student_id, exam_id, student:profiles!student_id(full_name, identifier), exam:exams(title, duration_minutes, subject:subjects(name))")
      .in("exam_id", examIds)
      .gte("start_time", startOfToday().toISOString())
      .order("start_time", { ascending: false })
      .limit(500);
    if (attemptError) {
      setError("Data monitoring belum bisa dimuat.");
      setLoading(false);
      return;
    }

    const rawRows = (attemptData ?? []) as unknown as RawAttempt[];
    const baseRows: MonitorRow[] = rawRows.map((raw) => {
      const exam = one(raw.exam);
      const duration = exam?.duration_minutes ?? 0;
      return {
        id: raw.id,
        status: raw.status,
        start_time: raw.start_time,
        submit_time: raw.submit_time,
        tab_switches: raw.tab_switches ?? 0,
        student_id: raw.student_id,
        exam_id: raw.exam_id,
        student_name: one(raw.student)?.full_name ?? "-",
        student_nis: one(raw.student)?.identifier ?? "-",
        exam_title: exam?.title ?? "-",
        subject_name: one(exam?.subject ?? null)?.name ?? "-",
        question_count: 0,
        duration_minutes: duration,
        deadline: new Date(raw.start_time).getTime() + duration * 60 * 1000,
        answeredCount: 0,
      };
    });

    const activeIds = baseRows.filter((r) => r.status === "in_progress" || r.status === "not_started").map((r) => r.id);
    const studentIds = [...new Set(baseRows.map((r) => r.student_id))];

    const [ansRes, eqRes, logRes] = await Promise.all([
      activeIds.length
        ? supabase.from("answers").select("attempt_id", { count: "exact", head: false }).in("attempt_id", activeIds)
        : Promise.resolve({ data: [] as { attempt_id: string }[], error: null }),
      activeIds.length
        ? supabase.from("exam_questions").select("exam_id").in("exam_id", [...new Set(baseRows.map((r) => r.exam_id))])
        : Promise.resolve({ data: [] as { exam_id: string }[], error: null }),
      activeIds.length
        ? supabase
            .from("audit_logs")
            .select("attempt_id, created_at")
            .in("attempt_id", activeIds)
            .gte("created_at", new Date(Date.now() - ONLINE_WINDOW_MS).toISOString())
        : Promise.resolve({ data: [] as { attempt_id: string }[], error: null }),
      studentIds.length
        ? supabase.from("class_enrollments").select("student_id, class:classes(name)").in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const answeredMap: Record<string, number> = {};
    for (const a of (ansRes.data ?? []) as { attempt_id: string }[]) {
      answeredMap[a.attempt_id] = (answeredMap[a.attempt_id] ?? 0) + 1;
    }
    const eqMap: Record<string, number> = {};
    for (const q of (eqRes.data ?? []) as { exam_id: string }[]) {
      eqMap[q.exam_id] = (eqMap[q.exam_id] ?? 0) + 1;
    }
    const classMap: Record<string, string> = {};
    for (const e of (studentIds.length ? (await supabase.from("class_enrollments").select("student_id, class:classes(name)").in("student_id", studentIds)).data : []) as unknown as { student_id: string; class: { name: string } | { name: string }[] | null }[]) {
      const cls = one(e.class);
      if (cls) classMap[e.student_id] = cls.name;
    }

    const online = new Set<string>();
    for (const log of (logRes.data ?? []) as { attempt_id: string }[]) online.add(log.attempt_id);

    const finalRows = baseRows.map((r) => ({
      ...r,
      question_count: eqMap[r.exam_id] ?? 0,
      answeredCount: answeredMap[r.id] ?? 0,
    }));

    setRows(finalRows);
    setClassByStudent(classMap);
    setOnlineIds(online);
    setLoading(false);
  }, [profile, isAdmin]);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    return () => clearInterval(refresh);
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterExam && r.exam_id !== filterExam) return false;
      if (filterClass) {
        const cls = classes.find((c) => c.id === filterClass);
        if (cls) {
          const studentClass = classByStudent[r.student_id];
          if (studentClass !== cls.name) {
            const exam = activeExams.find((e) => e.id === r.exam_id);
            if (exam?.class_name !== cls.name && exam?.class_level !== cls.level) return false;
          }
        }
      }
      return true;
    });
  }, [rows, filterExam, filterClass, classes, classByStudent, activeExams]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter((r) => r.status === "in_progress").length;
    const finished = filtered.filter((r) => r.status === "submitted" || r.status === "auto_submitted").length;
    const interrupted = filtered.filter((r) => r.status === "not_started" || r.status === "auto_submitted").length;
    return { total, active, finished, interrupted };
  }, [filtered]);

  const activeRows = filtered.filter((r) => r.status === "in_progress" || r.status === "not_started");

  const handleResetLogin = async () => {
    if (!resetTarget) return;
    const { error: rpcError } = await supabase.rpc("reset_attempt_login", { p_attempt_id: resetTarget.id });
    if (rpcError) {
      setActionMsg({ ok: false, text: `Gagal mereset login: ${rpcError.message}` });
    } else {
      setActionMsg({ ok: true, text: `Login ${resetTarget.student_name} berhasil direset. Siswa dapat masuk kembali dari perangkat lain.` });
      load();
    }
    setResetTarget(null);
  };

  const handleForceSubmit = async () => {
    if (!forceTarget) return;
    const { error: rpcError } = await supabase.rpc("submit_exam_attempt", { p_attempt_id: forceTarget.id });
    if (rpcError) {
      setActionMsg({ ok: false, text: `Gagal memaksa selesai: ${rpcError.message}` });
    } else {
      setActionMsg({ ok: true, text: `Ujian ${forceTarget.student_name} berhasil dipaksa selesai dan dinilai otomatis.` });
      load();
    }
    setForceTarget(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pemantauan Ujian</h1>
          <p className="text-sm text-slate-500 mt-1">Pantau siswa yang sedang mengerjakan ujian secara real-time</p>
        </div>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
        </span>
      </div>

      {actionMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${actionMsg.ok ? "bg-success-50 border-success-200 text-success-700" : "bg-error-50 border-error-200 text-error-700"}`}>
          {actionMsg.text}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter size={16} className="text-slate-400" /> Filter Pemantauan
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Kelas</label>
            <select className="input" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
              <option value="">Semua Kelas</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Jadwal Ujian Aktif</label>
            <select className="input" value={filterExam} onChange={(e) => setFilterExam(e.target.value)}>
              <option value="">Semua Ujian Aktif</option>
              {activeExams.map((e) => <option key={e.id} value={e.id}>{e.title} — {e.subject_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Siswa" value={stats.total} icon={<Users size={22} />} color="brand" />
        <StatCard label="Sedang Mengerjakan" value={stats.active} icon={<Activity size={22} />} color="success" />
        <StatCard label="Sudah Selesai" value={stats.finished} icon={<CheckCircle2 size={22} />} color="accent" />
        <StatCard label="Terkendala / Logout" value={stats.interrupted} icon={<AlertTriangle size={22} />} color="warning" />
      </div>

      {loading ? (
        <div className="card p-12 flex justify-center"><Spinner size={28} /></div>
      ) : error ? (
        <div className="card p-12"><EmptyState icon={<WifiOff size={28} />} title="Gagal memuat" description={error} /></div>
      ) : activeRows.length === 0 ? (
        <div className="card p-12">
          <EmptyState icon={<Monitor size={28} />} title="Tidak ada ujian berlangsung" description="Belum ada siswa yang sedang mengerjakan ujian. Data diperbarui otomatis setiap 10 detik." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Siswa Sedang Ujian</h2>
            <span className="text-xs text-slate-400">Diperbarui otomatis</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Nama Siswa</th>
                  <th className="px-4 py-2.5 font-semibold">NIS</th>
                  <th className="px-4 py-2.5 font-semibold">Koneksi</th>
                  <th className="px-4 py-2.5 font-semibold">Progress Soal</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Sisa Waktu</th>
                  <th className="px-4 py-2.5 font-semibold">Peringatan</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.map((row) => {
                  const online = onlineIds.has(row.id);
                  const isNotStarted = row.status === "not_started";
                  const remaining = row.deadline - now;
                  const timeColor = remaining <= 0 ? "text-error-600" : remaining < 300000 ? "text-warning-600" : "text-slate-700";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.student_name}</p>
                        <p className="text-xs text-slate-400">{row.exam_title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.student_nis}</td>
                      <td className="px-4 py-3">
                        {isNotStarted ? (
                          <Badge color="warning">Siap Login</Badge>
                        ) : online ? (
                          <span className="inline-flex items-center gap-1.5 text-success-600"><Wifi size={14} /> Online</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-400"><WifiOff size={14} /> Offline</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-600">{row.answeredCount}/{row.question_count || "?"}</span>
                          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${row.question_count ? Math.min(100, (row.answeredCount / row.question_count) * 100) : 0}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${timeColor}`}>
                        {isNotStarted ? "-" : formatRemaining(remaining)}
                      </td>
                      <td className="px-4 py-3">
                        {row.tab_switches > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-error-600">
                            <AlertTriangle size={14} /> {row.tab_switches}x pindah tab
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setResetTarget(row)}
                            disabled={isNotStarted}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-warning-700 bg-warning-50 hover:bg-warning-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Reset login siswa"
                          >
                            <RotateCcw size={13} /> Reset
                          </button>
                          <button
                            onClick={() => setForceTarget(row)}
                            disabled={isNotStarted}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-error-700 bg-error-50 hover:bg-error-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Paksa selesai & nilai otomatis"
                          >
                            <Flag size={13} /> Paksa Selesai
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={handleResetLogin}
        title="Reset Login Siswa"
        message={
          <>
            <p>Reset login untuk <strong>{resetTarget?.student_name}</strong>?</p>
            <p className="mt-2 text-xs text-slate-500">Status ujian diubah menjadi "Siap Login" sehingga siswa dapat masuk kembali dari perangkat lain. Jawaban yang sudah tersimpan tidak hilang.</p>
          </>
        }
        confirmText="Ya, Reset Login"
        danger
      />
      <ConfirmDialog
        open={!!forceTarget}
        onClose={() => setForceTarget(null)}
        onConfirm={handleForceSubmit}
        title="Paksa Selesai Ujian"
        message={
          <>
            <p>Paksa selesai ujian untuk <strong>{forceTarget?.student_name}</strong>?</p>
            <p className="mt-2 text-xs text-slate-500">Ujian akan langsung diakhiri dan dinilai otomatis berdasarkan jawaban yang sudah tersimpan. Tindakan ini tidak dapat dibatalkan.</p>
          </>
        }
        confirmText="Ya, Paksa Selesai"
        danger
      />
    </div>
  );
}

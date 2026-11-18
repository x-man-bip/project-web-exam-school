import { useEffect, useState } from "react";
import { Wifi, WifiOff, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, EmptyState, Spinner } from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { formatRemaining, one, startOfToday } from "@/components/dashboard/dashboardFormat";

const REFRESH_MS = 15000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

interface RawAttempt {
  id: string;
  status: string;
  start_time: string;
  student_id: string;
  exam_id: string;
  student: { full_name: string } | { full_name: string }[] | null;
  exam: {
    duration_minutes: number;
    title: string;
    subject: { name: string } | { name: string }[] | null;
  } | { duration_minutes: number; title: string; subject: { name: string } | { name: string }[] | null }[] | null;
}

interface AttemptRow {
  id: string;
  status: string;
  start_time: string;
  student_id: string;
  exam_id: string;
  student_name: string;
  subject_name: string;
  deadline: number;
}

export function LiveExamMonitor() {
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [classByStudent, setClassByStudent] = useState<Record<string, string>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resetTarget, setResetTarget] = useState<AttemptRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const triggerRefresh = useState(0)[1];

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: attemptError } = await supabase
        .from("exam_attempts")
        .select("id, status, start_time, student_id, exam_id, student:profiles!student_id(full_name), exam:exams(title, duration_minutes, subject:subjects(name))")
        .gte("start_time", startOfToday().toISOString())
        .order("start_time", { ascending: false })
        .limit(300);
      if (cancelled) return;

      if (attemptError) {
        setError("Data monitoring belum bisa dimuat.");
        setLoading(false);
        return;
      }

      const rows: AttemptRow[] = ((data ?? []) as unknown as RawAttempt[]).map((raw) => {
        const exam = one(raw.exam);
        const duration = exam?.duration_minutes ?? 0;
        return {
          id: raw.id,
          status: raw.status,
          start_time: raw.start_time,
          student_id: raw.student_id,
          exam_id: raw.exam_id,
          student_name: one(raw.student)?.full_name ?? "-",
          subject_name: one(exam?.subject ?? null)?.name ?? exam?.title ?? "-",
          deadline: new Date(raw.start_time).getTime() + duration * 60 * 1000,
        };
      });

      const activeRows = rows.filter((r) => r.status === "in_progress" || r.status === "not_started");
      const studentIds = [...new Set(rows.map((r) => r.student_id))];
      const activeIds = activeRows.map((r) => r.id);

      const [enrollRes, logRes] = await Promise.all([
        studentIds.length
          ? supabase.from("class_enrollments").select("student_id, class:classes(name)").in("student_id", studentIds)
          : Promise.resolve({ data: [], error: null }),
        activeIds.length
          ? supabase
              .from("audit_logs")
              .select("attempt_id, created_at")
              .in("attempt_id", activeIds)
              .gte("created_at", new Date(Date.now() - ONLINE_WINDOW_MS).toISOString())
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;

      const classMap: Record<string, string> = {};
      for (const e of (enrollRes.data ?? []) as unknown as { student_id: string; class: { name: string } | { name: string }[] | null }[]) {
        const cls = one(e.class);
        if (cls) classMap[e.student_id] = cls.name;
      }

      const online = new Set<string>();
      for (const log of (logRes.data ?? []) as unknown as { attempt_id: string }[]) {
        online.add(log.attempt_id);
      }

      setAttempts(rows);
      setClassByStudent(classMap);
      setOnlineIds(online);
      setError(null);
      setLoading(false);
    };

    load();
    const refresh = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, []);

  const handleResetLogin = async () => {
    if (!resetTarget) return;
    setResetting(true);
    setResetMsg(null);
    const { error: rpcError } = await supabase.rpc("reset_attempt_login", { p_attempt_id: resetTarget.id });
    if (rpcError) {
      setResetMsg(`Gagal mereset login: ${rpcError.message}`);
    } else {
      setResetMsg(`Login ${resetTarget.student_name} berhasil direset. Siswa dapat login kembali dari perangkat lain.`);
      triggerRefresh((n) => n + 1);
    }
    setResetting(false);
    setResetTarget(null);
  };

  const counts = {
    inProgress: attempts.filter((a) => a.status === "in_progress").length,
    notStarted: attempts.filter((a) => a.status === "not_started").length,
    submitted: attempts.filter((a) => a.status === "submitted").length,
    interrupted: attempts.filter((a) => a.status === "auto_submitted").length,
  };
  const total = attempts.length;
  const finished = counts.submitted + counts.interrupted;
  const progress = total > 0 ? Math.round((finished / total) * 100) : 0;
  const activeRows = attempts.filter((a) => a.status === "in_progress" || a.status === "not_started");

  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
          </span>
          <h2 className="text-lg font-semibold text-slate-800">Live Monitoring Ujian Hari Ini</h2>
        </div>
        <span className="text-xs text-slate-400">Diperbarui otomatis</span>
      </div>

      {resetMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${resetMsg.includes("berhasil") ? "bg-success-50 border-success-200 text-success-700" : "bg-error-50 border-error-200 text-error-700"}`}>
          {resetMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      ) : error ? (
        <EmptyState icon={<WifiOff size={24} />} title="Gagal memuat" description={error} />
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Progres pengerjaan</span>
              <span className="font-semibold text-slate-700">{finished} dari {total} selesai ({progress}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge color="brand">Sedang Mengerjakan ({counts.inProgress})</Badge>
            <Badge color="warning">Siap Login ({counts.notStarted})</Badge>
            <Badge color="success">Selesai ({counts.submitted})</Badge>
            <Badge color="error">Kendala/Terputus ({counts.interrupted})</Badge>
          </div>

          {activeRows.length === 0 ? (
            <EmptyState icon={<Wifi size={24} />} title="Tidak ada ujian berlangsung" description="Belum ada siswa yang sedang mengerjakan ujian." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-2.5 font-semibold">Kelas</th>
                    <th className="px-4 py-2.5 font-semibold">Mata Pelajaran</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Sisa Waktu</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeRows.map((row) => {
                    const online = onlineIds.has(row.id);
                    const isNotStarted = row.status === "not_started";
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{row.student_name}</td>
                        <td className="px-4 py-3 text-slate-600">{classByStudent[row.student_id] ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.subject_name}</td>
                        <td className="px-4 py-3">
                          {isNotStarted ? (
                            <Badge color="warning">Siap Login</Badge>
                          ) : (
                            <Badge color={online ? "success" : "slate"}>{online ? "Online" : "Offline"}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                          {isNotStarted ? "-" : formatRemaining(row.deadline - now)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setResetTarget(row)}
                            disabled={isNotStarted}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-warning-700 bg-warning-50 hover:bg-warning-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isNotStarted ? "Login sudah direset" : "Reset login siswa"}
                          >
                            <RotateCcw size={14} /> Reset Login
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => { setResetTarget(null); setResetMsg(null); }}
        onConfirm={handleResetLogin}
        title="Reset Login Siswa"
        message={
          <>
            <p>Reset login untuk <strong>{resetTarget?.student_name}</strong>?</p>
            <p className="mt-2 text-xs text-slate-500">
              Status ujian akan diubah menjadi "Siap Login" sehingga siswa dapat masuk kembali dari perangkat lain.
              Jawaban yang sudah tersimpan tidak akan hilang.
            </p>
          </>
        }
        confirmText={resetting ? "Mer..." : "Ya, Reset Login"}
        danger
      />
    </section>
  );
}

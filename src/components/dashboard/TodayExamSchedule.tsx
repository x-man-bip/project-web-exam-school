import { useEffect, useState } from "react";
import { CalendarClock, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, EmptyState, Spinner } from "@/components/ui";
import { formatTimeRange, one, startOfToday, startOfTomorrow } from "@/components/dashboard/dashboardFormat";

const REFRESH_MS = 60000;

interface RawExam {
  id: string;
  title: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  class_id: string | null;
  class_level: string | null;
  subject: { name: string } | { name: string }[] | null;
  class: { name: string } | { name: string }[] | null;
}

interface ExamSession {
  id: string;
  title: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  subject_name: string;
  target_label: string;
  token: string | null;
}

type SessionState = { label: string; color: "success" | "brand" | "slate" | "warning" };

function sessionState(session: ExamSession, now: number): SessionState {
  const start = session.start_time ? new Date(session.start_time).getTime() : null;
  const end = session.end_time ? new Date(session.end_time).getTime() : null;
  if (session.status === "active" && (start === null || end === null || (now >= start && now <= end))) {
    return { label: "Sedang Berlangsung", color: "success" };
  }
  if (start !== null && now < start) return { label: "Akan Datang", color: "brand" };
  if (end !== null && now > end) return { label: "Selesai", color: "slate" };
  return { label: "Menunggu Aktivasi", color: "warning" };
}

export function TodayExamSchedule() {
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const dayStart = startOfToday().toISOString();
      const dayEnd = startOfTomorrow().toISOString();
      const { data, error: examError } = await supabase
        .from("exams")
        .select("id, title, status, start_time, end_time, class_id, class_level, subject:subjects(name), class:classes(name)")
        .or(`status.eq.active,and(start_time.gte.${dayStart},start_time.lt.${dayEnd})`)
        .order("start_time", { ascending: true });
      if (cancelled) return;

      if (examError) {
        setError("Jadwal ujian belum bisa dimuat.");
        setLoading(false);
        return;
      }

      const exams = (data ?? []) as unknown as RawExam[];
      const examIds = exams.map((e) => e.id);
      const { data: tokenRows } = examIds.length
        ? await supabase.from("exam_access_tokens").select("exam_id, token").in("exam_id", examIds)
        : { data: [] };
      if (cancelled) return;

      const tokenByExam: Record<string, string> = {};
      for (const t of (tokenRows ?? []) as { exam_id: string; token: string }[]) {
        tokenByExam[t.exam_id] = t.token;
      }

      setSessions(
        exams.map((exam) => {
          const cls = one(exam.class);
          return {
            id: exam.id,
            title: exam.title,
            status: exam.status,
            start_time: exam.start_time,
            end_time: exam.end_time,
            subject_name: one(exam.subject)?.name ?? exam.title,
            target_label: cls?.name ?? (exam.class_level ? `Semua kelas ${exam.class_level}` : "-"),
            token: tokenByExam[exam.id] ?? null,
          };
        }),
      );
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

  return (
    <section className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock size={20} className="text-brand-600" />
        <h2 className="text-lg font-semibold text-slate-800">Jadwal Ujian Hari Ini</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      ) : error ? (
        <EmptyState icon={<CalendarClock size={24} />} title="Gagal memuat" description={error} />
      ) : sessions.length === 0 ? (
        <EmptyState icon={<CalendarClock size={24} />} title="Tidak ada jadwal" description="Belum ada ujian yang dijadwalkan atau diaktifkan hari ini." />
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const state = sessionState(session, now);
            return (
              <li key={session.id} className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800 leading-snug">{session.subject_name}</p>
                  <Badge color={state.color}>{state.label}</Badge>
                </div>
                <div className="text-sm text-slate-500 space-y-1">
                  <p>{session.target_label}</p>
                  <p>{formatTimeRange(session.start_time, session.end_time)}</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <KeyRound size={14} className="text-slate-400" />
                  {session.token ? (
                    <span className="font-mono text-sm font-semibold tracking-widest text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{session.token}</span>
                  ) : (
                    <span className="text-xs text-slate-400">Tanpa token</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

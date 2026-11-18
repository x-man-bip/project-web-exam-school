import { useCallback, useEffect, useState } from "react";
import {
  Users, Play, Search, Plus, Key, Clock, FileText, Pencil, Trash2,
  CalendarClock, CalendarDays, CheckSquare, FileUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type Exam, type Question, type Subject, type ClassRoom } from "@/lib/types";
import { StatCard, Badge, Spinner } from "@/components/ui";
import { TABLE_SCROLL_CLASS, TablePagination, usePagination } from "@/components/DataTable";
import { ExamTableSkeleton } from "@/components/ExamSkeletons";
import { ConfirmDialog } from "@/components/Modal";
import { ExamFormModal } from "@/components/ExamFormModal";
import { ManageExamQuestionsModal } from "@/components/ManageExamQuestionsModal";
import { targetLabelForQuestion } from "@/lib/questionTarget";
import { navigate } from "@/lib/router";

const SUBMITTED_STATUSES = ["submitted", "auto_submitted"];

export function AdminExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [tokenExamIds, setTokenExamIds] = useState<Set<string>>(new Set());
  const [studentCount, setStudentCount] = useState(0);
  const [pendingGradeCount, setPendingGradeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [manageExam, setManageExam] = useState<Exam | null>(null);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [e, q, s, c, t, submitted, pending] = await Promise.all([
      supabase.from("exams").select("*, subject:subjects(*), class:classes(*), teacher:profiles!teacher_id(full_name)").order("created_at", { ascending: false }),
      supabase.from("questions").select("*, subject:subjects(*), class:classes(*), teacher:profiles!teacher_id(full_name)").order("created_at", { ascending: false }),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("classes").select("*").order("name"),
      supabase.from("exam_access_tokens").select("exam_id"),
      supabase.from("exam_attempts").select("student_id").in("status", SUBMITTED_STATUSES),
      supabase.from("answers").select("id", { count: "exact", head: true }).eq("graded", false),
    ]);
    setExams(e.data as Exam[] ?? []);
    setQuestions(q.data as Question[] ?? []);
    setSubjects(s.data as Subject[] ?? []);
    setClasses(c.data as ClassRoom[] ?? []);
    setTokenExamIds(new Set((t.data ?? []).map((row) => row.exam_id as string)));
    setStudentCount(new Set((submitted.data ?? []).map((row) => row.student_id as string)).size);
    setPendingGradeCount(pending.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const examStatusInfo = (exam: Exam) => {
    if (exam.status === "active") return { label: "Berlangsung", color: "success" as const, dot: "bg-success-500" };
    if (exam.status === "published") return { label: "Dijadwalkan", color: "brand" as const, dot: "bg-brand-500" };
    return { label: "Draft", color: "warning" as const, dot: "bg-warning-500" };
  };

  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };

  const LEVELS = ["7", "8", "9"];

  const filtered = exams.filter((exam) => {
    if (filterClass) {
      const cls = classes.find((c) => c.id === filterClass);
      if (cls) {
        if (exam.class_id !== filterClass && exam.class_level !== cls.level) return false;
      }
    }
    if (filterSubject && exam.subject_id !== filterSubject) return false;
    if (filterStatus) {
      const si = examStatusInfo(exam);
      if (si.label !== filterStatus) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const teacherName = (exam as any).teacher?.full_name ?? "";
      if (!exam.title.toLowerCase().includes(s) &&
          !teacherName.toLowerCase().includes(s) &&
          !(exam.subject?.name ?? "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages, start, end } = usePagination(filtered);

  useEffect(() => { setPage(0); }, [search, filterClass, filterSubject, filterStatus, pageSize, setPage]);

  const stats = {
    active: exams.filter((e) => e.status === "active" || e.status === "published").length,
    today: exams.filter((e) => isToday(e.start_time)).length,
    totalStudents: studentCount,
    pendingGrade: pendingGradeCount,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ujian</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola semua ujian di sekolah</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
          <Plus size={18} /> Buat Ujian
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Ujian Aktif" value={stats.active} icon={<Play size={22} />} color="success" />
        <StatCard label="Berlangsung Hari Ini" value={stats.today} icon={<CalendarDays size={22} />} color="brand" />
        <StatCard label="Total Siswa Ujian" value={stats.totalStudents} icon={<Users size={22} />} color="accent" />
        <StatCard label="Menunggu Koreksi" value={stats.pendingGrade} icon={<CheckSquare size={22} />} color="warning" />
      </div>

      <div className="card p-4 space-y-3 sticky top-[60px] z-20">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Cari ujian berdasarkan judul, mapel, atau nama guru..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className="input" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
            <option value="">Semua Kelas</option>
            {LEVELS.map((l) => <option key={l} value={l}>Kelas {l}</option>)}
          </select>
          <select className="input" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="">Semua Mapel</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="Draft">Draft</option>
            <option value="Dijadwalkan">Dijadwalkan</option>
            <option value="Berlangsung">Berlangsung</option>
          </select>
        </div>
      </div>

      {loading ? (
        <ExamTableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <CalendarClock size={36} className="text-brand-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">
            {exams.length === 0 ? "Belum ada ujian" : "Tidak ada ujian yang cocok"}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {exams.length === 0
              ? "Mulai dengan membuat ujian pertama untuk sekolah, atau impor dari Bank Soal yang sudah tersedia."
              : "Coba ubah kata kunci pencarian atau filter yang digunakan."}
          </p>
          {exams.length === 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
                <Plus size={18} /> Buat Ujian Baru
              </button>
              <button onClick={() => navigate("/admin/bank-soal")} className="btn-secondary">
                <FileUp size={18} /> Impor Bank Soal
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className={TABLE_SCROLL_CLASS}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50/50">
                  <th className="px-4 py-3 font-medium">Nama Ujian & Mapel</th>
                  <th className="px-4 py-3 font-medium">Target Kelas</th>
                  <th className="px-4 py-3 font-medium">Jadwal</th>
                  <th className="px-4 py-3 font-medium">Durasi</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((exam) => {
                  const si = examStatusInfo(exam);
                  return (
                    <tr key={exam.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tokenExamIds.has(exam.id) && <Key size={14} className="text-brand-400 flex-shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{exam.title}</p>
                            <p className="text-xs text-slate-400">{exam.subject?.name ?? "-"}{exam.strict_mode && <span className="text-error-400 ml-1">Strict</span>}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge color="slate">{targetLabelForQuestion(exam)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {exam.start_time ? (
                          <>
                            <p className="font-medium text-slate-600">{new Date(exam.start_time).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</p>
                            <p>{new Date(exam.start_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB</p>
                          </>
                        ) : <span className="text-slate-300">Belum dijadwalkan</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-slate-600"><Clock size={14} className="text-slate-400" /> {exam.duration_minutes}m</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${si.dot}`} />
                          <Badge color={si.color}>{si.label}</Badge>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setManageExam(exam)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition" title="Kelola Soal"><FileText size={15} /></button>
                          <button onClick={() => { setEditing(exam); setShowForm(true); }} className="p-2 rounded-lg text-slate-400 hover:bg-accent-50 hover:text-accent-600 transition" title="Edit"><Pencil size={15} /></button>
                          <button onClick={() => setDeleteTarget(exam)} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600 transition" title="Hapus"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <TablePagination
            total={total}
            page={page}
            totalPages={totalPages}
            start={start}
            end={end}
            pageSize={pageSize}
            noun="ujian"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
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

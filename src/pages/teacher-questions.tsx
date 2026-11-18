import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Copy, Eye, FileSpreadsheet, MessageSquare,
  Pencil, Plus, RotateCcw, Search, Send, Trash2, Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buildTargetGroups, targetKeyForQuestion, targetLabelForQuestion } from "@/lib/questionTarget";
import { fetchTeacherClasses } from "@/lib/teacherClasses";
import { fetchTeacherSubjects } from "@/lib/teacherSubjects";
import {
  type ClassRoom, type Question, type QuestionVerificationStatus, type Subject,
  QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS,
} from "@/lib/types";
import { Badge, EmptyState } from "@/components/ui";
import { TABLE_SCROLL_CLASS, TablePagination, usePagination } from "@/components/DataTable";
import { ConfirmDialog } from "@/components/Modal";
import { QuestionFormModal } from "@/components/QuestionFormModal";
import { QuestionImportModal } from "@/components/QuestionImportModal";
import { QuestionPreviewModal } from "@/components/QuestionPreviewModal";

const SKELETON_ROWS = 6;

const STATUS_BADGE_COLOR: Record<QuestionVerificationStatus, "slate" | "warning" | "success"> = {
  draft: "slate",
  pending_review: "warning",
  approved: "success",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function TeacherQuestions() {
  const { profile } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [previewing, setPreviewing] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [q, taughtSubjects, taughtClasses] = await Promise.all([
      supabase.from("questions").select("*, subject:subjects(*), class:classes(*)").eq("teacher_id", profile.id).order("created_at", { ascending: false }),
      fetchTeacherSubjects(profile.id),
      fetchTeacherClasses(profile.id),
    ]);
    if (q.error) {
      setLoadError("Bank soal belum bisa dimuat. Coba muat ulang halaman.");
    } else {
      setLoadError(null);
      setQuestions((q.data ?? []) as Question[]);
    }
    setSubjects(taughtSubjects.sort((a, b) => a.name.localeCompare(b.name, "id")));
    setClasses(taughtClasses);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const hasFilter = !!(search || filterSubject || filterClass || filterStatus);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (filterSubject && q.subject_id !== filterSubject) return false;
      if (filterClass && targetKeyForQuestion(q) !== filterClass) return false;
      if (filterStatus && q.verification_status !== filterStatus) return false;
      if (term) {
        const haystack = `${q.content} ${QUESTION_TYPE_LABELS[q.type]} ${q.subject?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [questions, search, filterSubject, filterClass, filterStatus]);

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages, start, end } = usePagination(filtered);

  useEffect(() => { setPage(0); }, [search, filterSubject, filterClass, filterStatus, pageSize, setPage]);

  const resetFilters = () => {
    setSearch("");
    setFilterSubject("");
    setFilterClass("");
    setFilterStatus("");
  };

  const duplicate = async (q: Question) => {
    if (!profile) return;
    setActionError(null);
    const { error } = await supabase.from("questions").insert({
      teacher_id: q.teacher_id,
      subject_id: q.subject_id,
      class_id: q.class_id,
      class_level: q.class_level,
      type: q.type,
      content: `${q.content} (salinan)`,
      options: q.options,
      correct_answer: q.correct_answer,
      points: q.points,
      verification_status: "draft",
    });
    if (error) setActionError("Soal gagal diduplikasi. Coba lagi.");
    load();
  };

  const submitForReview = async (q: Question) => {
    setActionError(null);
    const { error } = await supabase.from("questions").update({ verification_status: "pending_review", review_note: null }).eq("id", q.id);
    if (error) setActionError("Soal gagal dikirim untuk review. Coba lagi.");
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    const { error } = await supabase.from("questions").delete().eq("id", deleteTarget.id);
    if (error) setActionError("Soal gagal dihapus. Coba lagi.");
    setDeleteTarget(null);
    load();
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (q: Question) => { setEditing(q); setShowForm(true); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bank Soal</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola soal untuk ujian Anda</p>
        </div>
        {!loading && questions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowImport(true)} className="btn-secondary">
              <Upload size={18} /> Import Soal
            </button>
            <button onClick={openCreate} className="btn-primary">
              <Plus size={18} /> Buat Soal Baru
            </button>
          </div>
        )}
      </div>

      {loadError && <div className="rounded-lg border px-4 py-3 text-sm bg-error-50 border-error-200 text-error-700">{loadError}</div>}
      {actionError && <div className="rounded-lg border px-4 py-3 text-sm bg-error-50 border-error-200 text-error-700">{actionError}</div>}

      {!loading && questions.length === 0 && !loadError ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen size={28} />}
            title="Belum Ada Bank Soal"
            description="Mulai dengan membuat soal satu per satu, atau impor sekaligus dari file Excel atau CSV."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={openCreate} className="btn-primary"><Plus size={18} /> Buat Soal Baru</button>
                <button onClick={() => setShowImport(true)} className="btn-secondary"><FileSpreadsheet size={18} /> Import Excel/CSV</button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="card p-4 space-y-3 sticky top-[60px] z-20">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-10" placeholder="Cari teks soal, tipe, atau mapel..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select className="input" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} aria-label="Filter mata pelajaran">
                <option value="">Semua Mapel</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="input" value={filterClass} onChange={(e) => setFilterClass(e.target.value)} aria-label="Filter kelas">
                <option value="">Semua Kelas</option>
                {buildTargetGroups(classes).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter status">
                <option value="">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Menunggu Review</option>
                <option value="approved">Disetujui</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-sm text-slate-500">
                {loading ? "Memuat soal..." : `Menampilkan ${filtered.length} soal`}
              </p>
              <button onClick={resetFilters} disabled={!hasFilter} className="btn-ghost text-sm disabled:opacity-40">
                <RotateCcw size={14} /> Reset Filter
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className={TABLE_SCROLL_CLASS}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-4 py-3 font-semibold">Pertanyaan</th>
                    <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                    <th className="px-4 py-3 font-semibold">Kelas</th>
                    <th className="px-4 py-3 font-semibold">Tipe</th>
                    <th className="px-4 py-3 font-semibold">Dibuat</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-4"><div className="h-3.5 w-3/4 rounded bg-slate-200" /><div className="mt-2 h-3 w-1/3 rounded bg-slate-100" /></td>
                        <td className="px-4 py-4"><div className="h-5 w-20 rounded-full bg-slate-200" /></td>
                        <td className="px-4 py-4"><div className="h-5 w-16 rounded-full bg-slate-200" /></td>
                        <td className="px-4 py-4"><div className="h-5 w-16 rounded-full bg-slate-200" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-20 rounded bg-slate-200" /></td>
                        <td className="px-4 py-4"><div className="ml-auto h-7 w-28 rounded bg-slate-100" /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                        Tidak ada soal yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    paged.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 max-w-md">
                          <p className="line-clamp-2 text-slate-800">{q.content}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge color={STATUS_BADGE_COLOR[q.verification_status]}>{QUESTION_STATUS_LABELS[q.verification_status]}</Badge>
                            {q.review_note && (
                              <span className="flex items-center gap-1 text-xs text-warning-700"><MessageSquare size={12} /> {q.review_note}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3"><Badge color="accent">{q.subject?.name ?? "-"}</Badge></td>
                        <td className="px-4 py-3"><Badge color="slate">{targetLabelForQuestion(q)}</Badge></td>
                        <td className="px-4 py-3"><Badge color="brand">{QUESTION_TYPE_LABELS[q.type]}</Badge></td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-500">{formatDate(q.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setPreviewing(q)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Pratinjau">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => openEdit(q)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit">
                              <Pencil size={16} />
                            </button>
                            {q.verification_status === "draft" && (
                              <button onClick={() => submitForReview(q)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Kirim untuk Review KS">
                                <Send size={16} />
                              </button>
                            )}
                            <button onClick={() => duplicate(q)} className="p-2 rounded-lg text-slate-400 hover:bg-accent-50 hover:text-accent-600" title="Duplikat">
                              <Copy size={16} />
                            </button>
                            <button onClick={() => setDeleteTarget(q)} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600" title="Hapus">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && (
              <TablePagination
                total={total}
                page={page}
                totalPages={totalPages}
                start={start}
                end={end}
                pageSize={pageSize}
                noun="soal"
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </div>
        </>
      )}

      {showForm && (
        <QuestionFormModal
          question={editing}
          subjects={subjects}
          classes={classes}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {showImport && (
        <QuestionImportModal
          subjects={subjects}
          classes={classes}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
      {previewing && (
        <QuestionPreviewModal question={previewing} onClose={() => setPreviewing(null)} />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Soal"
        message="Yakin ingin menghapus soal ini?"
        confirmText="Hapus"
        danger
      />
    </div>
  );
}

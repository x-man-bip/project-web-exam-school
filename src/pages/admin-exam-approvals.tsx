import { useCallback, useEffect, useState } from "react";
import { CheckCircle, ClipboardCheck, Clock, Eye, MessageSquare, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type Exam, type ExamQuestion, QUESTION_TYPE_LABELS } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { Badge, EmptyState, Spinner } from "@/components/ui";

type Decision = "approved" | "rejected";

export function AdminExamApprovals() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("exams")
      .select("*, subject:subjects(*), class:classes(*), teacher:profiles!teacher_id(full_name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true });
    if (error) setLoadError("Daftar persetujuan belum bisa dimuat. Coba muat ulang halaman.");
    setExams((data as Exam[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDecided = (message: string) => {
    setSelected(null);
    setNotice(message);
    load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Persetujuan Ujian</h1>
            <p className="text-sm text-slate-500">Tinjau dan setujui ujian yang diajukan oleh guru sebelum dapat dimulai.</p>
          </div>
        </div>
      </header>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="font-medium hover:underline">Tutup</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={32} />}
          title="Tidak ada ujian yang menunggu persetujuan"
          description="Ketika guru mengajukan ujian, daftarnya akan muncul di sini untuk Anda tinjau."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {exams.map((exam) => (
            <li key={exam.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900">{exam.title}</h2>
                    <p className="text-sm text-slate-500">{exam.subject?.name ?? "-"}</p>
                  </div>
                  <Badge color="warning">Menunggu KS</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Guru</dt>
                  <dd className="text-slate-800">{exam.teacher?.full_name ?? "-"}</dd>
                  <dt className="text-slate-500">Kelas</dt>
                  <dd className="text-slate-800">{exam.class?.name ?? exam.class_level ?? "-"}</dd>
                  <dt className="text-slate-500">Durasi</dt>
                  <dd className="text-slate-800">{exam.duration_minutes} menit</dd>
                </dl>
              </div>
              <button
                onClick={() => setSelected(exam)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <Eye size={16} /> Tinjau Soal
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <ExamApprovalReviewModal
          exam={selected}
          onClose={() => setSelected(null)}
          onDecided={handleDecided}
        />
      )}
    </div>
  );
}

function ExamApprovalReviewModal({ exam, onClose, onDecided }: {
  exam: Exam;
  onClose: () => void;
  onDecided: (message: string) => void;
}) {
  const [items, setItems] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;
    supabase
      .from("exam_questions")
      .select("*, question:questions(*)")
      .eq("exam_id", exam.id)
      .order("question_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError("Soal ujian belum bisa dimuat.");
        else setItems((data as ExamQuestion[]) ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, [exam.id]);

  const decide = async (action: Decision, decisionNote: string | null) => {
    setSubmitting(action);
    setActionError(null);
    const { error } = await supabase.rpc("submit_exam_approval", {
      p_exam_id: exam.id,
      p_action: action,
      p_note: decisionNote,
    });
    setSubmitting(null);
    if (error) {
      setActionError("Keputusan belum tersimpan. Periksa koneksi lalu coba lagi.");
      return;
    }
    onDecided(
      action === "approved"
        ? `Ujian "${exam.title}" disetujui. Guru sekarang dapat memulai ujian.`
        : `Catatan revisi untuk "${exam.title}" sudah dikirim ke guru.`
    );
  };

  const canApprove = !loading && !loadError && items.length > 0 && !submitting;
  const trimmedNote = note.trim();

  return (
    <>
      <Modal open onClose={onClose} title={exam.title} size="xl">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span>Guru: <strong className="text-slate-800">{exam.teacher?.full_name ?? "-"}</strong></span>
            <span>Mapel: <strong className="text-slate-800">{exam.subject?.name ?? "-"}</strong></span>
            <span>Kelas: <strong className="text-slate-800">{exam.class?.name ?? exam.class_level ?? "-"}</strong></span>
            <span>Durasi: <strong className="text-slate-800">{exam.duration_minutes} menit</strong></span>
          </div>

          {exam.description && (
            <p className="text-sm text-slate-600">{exam.description}</p>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : loadError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Ujian ini belum memiliki soal. Minta guru menambahkan soal sebelum disetujui.
              </div>
            ) : (
              items.map((item, index) => <QuestionPreview key={item.id} index={index} item={item} />)
            )}
          </div>

          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              onClick={() => { setActionError(null); setRejecting(true); }}
              disabled={loading || !!submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle size={16} /> Tolak / Minta Revisi
            </button>
            <button
              onClick={() => decide("approved", null)}
              disabled={!canApprove}
              title={items.length === 0 && !loading ? "Ujian belum memiliki soal" : undefined}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "approved" ? <Spinner size={16} /> : <CheckCircle size={16} />} Setujui
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Catatan Revisi" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Jelaskan bagian yang perlu diperbaiki. Catatan ini akan ditampilkan kepada guru.
          </p>
          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MessageSquare size={16} /> Catatan untuk guru
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="Contoh: Soal nomor 3 kunci jawabannya belum sesuai dengan materi."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setRejecting(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              onClick={() => decide("rejected", trimmedNote)}
              disabled={!trimmedNote || !!submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "rejected" ? <Spinner size={16} /> : <Clock size={16} />} Kirim Revisi
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function optionText(option: unknown): string {
  if (typeof option === "string") return option;
  if (option && typeof option === "object") {
    const value = option as { text?: unknown; label?: unknown };
    return String(value.text ?? value.label ?? "");
  }
  return "";
}

function QuestionPreview({ index, item }: { index: number; item: ExamQuestion }) {
  const question = item.question;
  if (!question) return null;
  const options = Array.isArray(question.options) ? question.options : [];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">Soal {index + 1}</span>
        <Badge color="slate">{QUESTION_TYPE_LABELS[question.type]}</Badge>
        <span className="text-xs text-slate-500">{item.points} poin</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{question.content}</p>
      {options.length > 0 && (
        <ol className="mt-3 space-y-2">
          {options.map((option, optionIndex) => (
            <li key={optionIndex} className="flex gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-500">{String.fromCharCode(65 + optionIndex)}.</span>
              <span className="flex-1">{optionText(option)}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

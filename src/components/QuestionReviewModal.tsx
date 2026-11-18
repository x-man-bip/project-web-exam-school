import { useState } from "react";
import { CheckCircle, AlertCircle, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS, type Question } from "@/lib/types";
import { targetLabelForQuestion } from "@/lib/questionTarget";

interface QuestionReviewModalProps {
  question: Question;
  onClose: () => void;
  onSaved: () => void;
}

export function QuestionReviewModal({ question, onClose, onSaved }: QuestionReviewModalProps) {
  const [note, setNote] = useState(question.review_note ?? "");
  const [action, setAction] = useState<"approve" | "request_revision" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!action) {
      setError("Pilih aksi: setujui atau minta revisi.");
      return;
    }
    setLoading(true);
    setError(null);

    const newStatus = action === "approve" ? "approved" : "pending_review";
    const reviewNote = action === "approve" ? note.trim() || null : note.trim();

    if (action === "request_revision" && !reviewNote) {
      setError("Catatan revisi wajib diisi saat meminta revisi.");
      setLoading(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("submit_question_review", {
      p_question_id: question.id,
      p_status: newStatus,
      p_note: reviewNote,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Review & Supervisi Soal" size="md">
      <div className="space-y-4">
        {/* Question summary */}
        <div className="rounded-lg border border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="accent">{QUESTION_TYPE_LABELS[question.type]}</Badge>
            <Badge color="slate">{question.subject?.name ?? "-"}</Badge>
            <Badge color="brand">{targetLabelForQuestion(question)}</Badge>
            <Badge color="warning">{question.points} poin</Badge>
          </div>
          <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap line-clamp-3">{question.content}</p>
          <p className="text-xs text-slate-400">oleh {question.teacher?.full_name ?? "Guru"}</p>
        </div>

        {/* Existing review note */}
        {question.review_note && (
          <div className="rounded-lg bg-warning-50 border border-warning-200 p-3">
            <p className="text-xs font-medium text-warning-700 mb-1 flex items-center gap-1">
              <MessageSquare size={14} /> Catatan Review Sebelumnya
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{question.review_note}</p>
          </div>
        )}

        {/* Action selection */}
        <div>
          <label className="label">Aksi Verifikasi</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setAction("approve"); setError(null); }}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${
                action === "approve"
                  ? "border-success-300 bg-success-50 text-success-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <CheckCircle size={18} /> Setujui Soal
            </button>
            <button
              onClick={() => { setAction("request_revision"); setError(null); }}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${
                action === "request_revision"
                  ? "border-warning-300 bg-warning-50 text-warning-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <AlertCircle size={18} /> Minta Revisi
            </button>
          </div>
        </div>

        {/* Review note */}
        <div>
          <label className="label">
            {action === "request_revision" ? "Catatan Revisi (wajib)" : "Catatan (opsional)"}
          </label>
          <textarea
            className="input min-h-[100px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tuliskan catatan revisi untuk guru pembuat, misal: 'Indikator soal nomor 3 belum sesuai dengan KD'..."
          />
          {action === "request_revision" && (
            <p className="mt-1.5 text-xs text-slate-500">
              Catatan ini akan terkirim sebagai notifikasi kepada guru pembuat soal.
            </p>
          )}
        </div>

        {/* Current status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Status saat ini:</span>
          <Badge color={question.verification_status === "approved" ? "success" : question.verification_status === "pending_review" ? "warning" : "slate"}>
            {QUESTION_STATUS_LABELS[question.verification_status]}
          </Badge>
        </div>

        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={loading} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading || !action} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan Review
          </button>
        </div>
      </div>
    </Modal>
  );
}

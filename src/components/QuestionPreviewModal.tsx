import { Check, X } from "lucide-react";
import { type Question, QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS, normalizeOption } from "@/lib/types";
import { targetLabelForQuestion } from "@/lib/questionTarget";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";

const LETTERS = "ABCDE";

export function QuestionPreviewModal({ question, onClose }: { question: Question; onClose: () => void }) {
  const correctList: unknown[] = Array.isArray(question.correct_answer) ? question.correct_answer : [];

  const isOptionCorrect = (index: number) => {
    if (question.type === "pg") return question.correct_answer === index;
    if (question.type === "mcma") return correctList.includes(index);
    return false;
  };

  return (
    <Modal open={true} onClose={onClose} title="Pratinjau Soal" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge color="brand">{QUESTION_TYPE_LABELS[question.type]}</Badge>
          <Badge color="accent">{question.subject?.name ?? "-"}</Badge>
          <Badge color="slate">{targetLabelForQuestion(question)}</Badge>
          <Badge color="warning">{question.points} poin</Badge>
          <Badge color="success">{QUESTION_STATUS_LABELS[question.verification_status]}</Badge>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
          {question.image_url && (
            <img src={question.image_url} alt="Gambar soal" className="mx-auto max-h-72 rounded-lg border border-slate-200 bg-white object-contain" />
          )}
          <p className="whitespace-pre-line text-base leading-relaxed text-slate-800">{question.content}</p>
        </div>

        {question.type === "uraian" ? (
          <div className="space-y-2">
            <p className="label">Kunci / Panduan Koreksi</p>
            <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm whitespace-pre-line text-success-800">
              {question.correct_answer || "Belum ada kunci jawaban."}
            </div>
          </div>
        ) : (
          <ol className="space-y-2">
            {question.options.map(normalizeOption).map((opt, i) => {
              const correct = question.type === "pg_kompleks" ? correctList[i] === true : isOptionCorrect(i);
              const label = question.type === "pg_kompleks" ? `Pernyataan ${i + 1}` : LETTERS[i];
              return (
                <li
                  key={i}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${correct ? "border-success-300 bg-success-50" : "border-slate-200 bg-white"}`}
                >
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-semibold ${correct ? "bg-success-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {label}
                  </span>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-slate-700">{opt.text || <em className="text-slate-400">(kosong)</em>}</p>
                    {opt.image_url && (
                      <img src={opt.image_url} alt={`Gambar pilihan ${label}`} className="max-h-32 rounded-md border border-slate-200 bg-white object-contain" />
                    )}
                  </div>
                  {question.type === "pg_kompleks" ? (
                    <Badge color={correct ? "success" : "slate"}>{correct ? "Benar" : "Salah"}</Badge>
                  ) : correct ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-success-700"><Check size={14} /> Kunci</span>
                  ) : (
                    <X size={14} className="mt-1 text-slate-300" />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}

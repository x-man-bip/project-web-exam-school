import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { targetLabelForQuestion } from "@/lib/questionTarget";
import { type Exam, type ExamQuestion, type Question, QUESTION_TYPE_LABELS } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { Badge, Spinner } from "@/components/ui";

export function ManageExamQuestionsModal({ exam, questions, onClose, onSaved }: {
  exam: Exam;
  questions: Question[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exam_questions")
      .select("*, question:questions(*)")
      .eq("exam_id", exam.id)
      .order("question_order");
    setExamQuestions(data as ExamQuestion[] ?? []);
    setLoading(false);
  }, [exam.id]);

  useEffect(() => { load(); }, [load]);

  const availableQuestions = questions.filter((q) =>
    q.subject_id === exam.subject_id &&
    (exam.class_id
      ? q.class_id === exam.class_id || (q.class_level !== null && q.class_level === exam.class?.level)
      : q.class_level === exam.class_level || (!!q.class && q.class.level === exam.class_level)) &&
    !examQuestions.some((eq) => eq.question_id === q.id)
  );

  const addQuestion = async (q: Question) => {
    const order = examQuestions.length;
    await supabase.from("exam_questions").insert({
      exam_id: exam.id, question_id: q.id, points: q.points, question_order: order,
    });
    load();
  };

  const removeQuestion = async (eq: ExamQuestion) => {
    await supabase.from("exam_questions").delete().eq("id", eq.id);
    load();
  };

  const updatePoints = async (eq: ExamQuestion, points: number) => {
    await supabase.from("exam_questions").update({ points }).eq("id", eq.id);
    load();
  };

  const totalPoints = examQuestions.reduce((sum, eq) => sum + Number(eq.points), 0);

  return (
    <Modal open={true} onClose={onClose} title={`Kelola Soal: ${exam.title}`} size="xl">
      <div className="space-y-5">
        {loading ? <div className="flex justify-center py-8"><Spinner size={28} /></div> : (
          <>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700">Soal dalam Ujian ({examQuestions.length})</h3>
                <Badge color="brand">Total: {totalPoints} poin</Badge>
              </div>
              {examQuestions.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Belum ada soal ditambahkan</p>
              ) : (
                <div className="space-y-2">
                  {examQuestions.map((eq, i) => (
                    <div key={eq.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-400 w-6">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <Badge color="slate">{QUESTION_TYPE_LABELS[eq.question?.type ?? "uraian"]}</Badge>
                        <p className="text-sm text-slate-700 mt-1 line-clamp-1">{eq.question?.content}</p>
                      </div>
                      <input type="number" step="0.5" min="0" className="input w-20 text-center" value={eq.points} onChange={(e) => updatePoints(eq, Number(e.target.value))} />
                      <button onClick={() => removeQuestion(eq)} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-700 mb-3">Soal Tersedia ({availableQuestions.length})</h3>
              {availableQuestions.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Semua soal sudah ditambahkan atau belum ada soal untuk mapel & kelas ini</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableQuestions.map((q) => (
                    <div key={q.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color="accent">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                          <Badge color="slate">{targetLabelForQuestion(q)}</Badge>
                          {q.teacher?.full_name && <span className="text-xs text-slate-400">oleh {q.teacher.full_name}</span>}
                        </div>
                        <p className="text-sm text-slate-700 mt-1 line-clamp-1">{q.content}</p>
                      </div>
                      <Badge color="warning">{q.points} poin</Badge>
                      <button onClick={() => addQuestion(q)} className="btn-primary text-xs px-3 py-1.5"><Plus size={14} /> Tambah</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={() => { onSaved(); onClose(); }} className="btn-primary">Selesai</button>
        </div>
      </div>
    </Modal>
  );
}

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buildTargetGroups, targetKeyForQuestion, targetToPayload } from "@/lib/questionTarget";
import { type ClassRoom, type Question, type QuestionOption, type QuestionType, type Subject, normalizeOption } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { QuestionImagePicker } from "@/components/questions/QuestionImagePicker";

const MAX_OPTIONS = 5;
const MIN_OPTIONS_PG = 2;
const MIN_OPTIONS_PG_KOMPLEKS = 3;

function minOptionsFor(type: QuestionType): number {
  return type === "pg_kompleks" ? MIN_OPTIONS_PG_KOMPLEKS : MIN_OPTIONS_PG;
}

const blankOption = (): QuestionOption => ({ text: "", image_url: null });

function defaultOptions(type: QuestionType): QuestionOption[] {
  if (type === "pg" || type === "mcma") return [blankOption(), blankOption(), blankOption(), blankOption()];
  if (type === "pg_kompleks") return [blankOption(), blankOption(), blankOption()];
  return [];
}

export function QuestionFormModal({ question, subjects, classes, onClose, onSaved }: {
  question: Question | null;
  subjects: Subject[];
  classes: ClassRoom[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [type, setType] = useState<QuestionType>(question?.type ?? "pg");
  const [content, setContent] = useState(question?.content ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(question?.image_url ?? null);
  const [subjectId, setSubjectId] = useState(question?.subject_id ?? "");
  const [targetValue, setTargetValue] = useState(question ? targetKeyForQuestion(question) : "");
  const [points, setPoints] = useState(question?.points ?? 1);
  const [options, setOptions] = useState<QuestionOption[]>(
    question && question.type !== "uraian" ? question.options.map(normalizeOption) : defaultOptions(type),
  );
  const [correctAnswer, setCorrectAnswer] = useState<any>(question?.correct_answer ?? (type === "pg" ? null : type === "mcma" ? [] : type === "pg_kompleks" ? [false, false, false] : ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOption = (index: number, patch: Partial<QuestionOption>) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, blankOption()]);
    if (type === "pg_kompleks") setCorrectAnswer((prev: any) => Array.isArray(prev) ? [...prev, false] : prev);
  };

  const removeOption = (index: number) => {
    if (options.length <= minOptionsFor(type)) return;
    const removed = options[index];
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    if (type === "pg") {
      if (correctAnswer === index) setCorrectAnswer(null);
      else if (typeof correctAnswer === "number" && correctAnswer > index) setCorrectAnswer(correctAnswer - 1);
    } else if (type === "pg_kompleks") {
      setCorrectAnswer((prev: any) => Array.isArray(prev) ? prev.filter((_, i) => i !== index) : prev);
    } else if (type === "mcma") {
      const selected = Array.isArray(correctAnswer) ? correctAnswer.filter((x: number) => x !== index) : [];
      setCorrectAnswer(selected.map((x: number) => (x > index ? x - 1 : x)).sort((a: number, b: number) => a - b));
    }
  };

  const submit = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const payload = {
      teacher_id: profile.id,
      subject_id: subjectId,
      ...targetToPayload(targetValue),
      type,
      content,
      image_url: imageUrl,
      options,
      correct_answer: correctAnswer,
      points,
    };
    let res;
    if (question) {
      res = await supabase.from("questions").update(payload).eq("id", question.id);
    } else {
      res = await supabase.from("questions").insert(payload);
    }
    setLoading(false);
    if (res.error) { setError(res.error.message); return; }
    onSaved();
    onClose();
  };

  const typeBadgeColors: Record<QuestionType, string> = {
    pg: "Pilihan Ganda Biasa",
    pg_kompleks: "PG Kompleks (3 pernyataan Benar/Salah)",
    mcma: "Centang Banyak Jawaban Benar",
    uraian: "Uraian / Jawaban Singkat",
  };

  const changeType = (t: QuestionType) => {
    setType(t);
    setOptions(defaultOptions(t));
    if (t === "pg") setCorrectAnswer(null);
    else if (t === "pg_kompleks") setCorrectAnswer([false, false, false]);
    else if (t === "mcma") setCorrectAnswer([]);
    else setCorrectAnswer("");
  };

  const optionRow = (opt: QuestionOption, i: number, input: ReactNode, placeholder: string, canDelete: boolean) => (
    <div key={i} className="flex items-center gap-2">
      {input}
      <input
        className="input"
        value={opt.text}
        onChange={(e) => updateOption(i, { text: e.target.value })}
        placeholder={placeholder}
      />
      <QuestionImagePicker
        variant="compact"
        value={opt.image_url}
        onChange={(url) => updateOption(i, { image_url: url })}
        ownerId={profile?.id ?? ""}
        label={`Gambar ${String.fromCharCode(65 + i)}`}
      />
      {canDelete && (
        <button
          type="button"
          onClick={() => removeOption(i)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-error-50 hover:text-error-600"
          title="Hapus pilihan"
          aria-label="Hapus pilihan"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );

  return (
    <Modal open={true} onClose={onClose} title={question ? "Edit Soal" : "Tambah Soal"} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipe Soal</label>
            <select className="input" value={type} onChange={(e) => changeType(e.target.value as QuestionType)}>
              {(Object.keys(typeBadgeColors) as QuestionType[]).map((t) => <option key={t} value={t}>{typeBadgeColors[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Poin (Bobot)</label>
            <input type="number" step="0.5" min="0" className="input" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Mata Pelajaran</label>
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Pilih mapel...</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Kelas Target</label>
            <select className="input" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
              <option value="">Pilih kelas...</option>
              {buildTargetGroups(classes).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Pertanyaan</label>
          <textarea className="input min-h-[80px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tulis pertanyaan..." />
        </div>

        <QuestionImagePicker
          value={imageUrl}
          onChange={setImageUrl}
          ownerId={profile?.id ?? ""}
          label="Gambar Soal"
        />

        {type === "pg" && (
          <div className="space-y-2">
            <label className="label">Pilihan Jawaban (pilih jawaban benar)</label>
            {options.map((opt, i) => optionRow(opt, i, (
              <input type="radio" name="pg-correct" checked={correctAnswer === i} onChange={() => setCorrectAnswer(i)} className="text-brand-600" />
            ), `Pilihan ${String.fromCharCode(65 + i)}`, options.length > MIN_OPTIONS_PG))}
            {options.length < MAX_OPTIONS && (
              <button onClick={addOption} className="btn-ghost text-sm"><Plus size={14} /> Tambah pilihan</button>
            )}
          </div>
        )}

        {type === "pg_kompleks" && (
          <div className="space-y-2">
            <label className="label">Pernyataan (tandai Benar/Salah)</label>
            {options.map((opt, i) => optionRow(opt, i, (
              <select className="input w-28" value={correctAnswer[i] ? "true" : "false"} onChange={(e) => { const ca = [...correctAnswer]; ca[i] = e.target.value === "true"; setCorrectAnswer(ca); }}>
                <option value="false">Salah</option>
                <option value="true">Benar</option>
              </select>
            ), `Pernyataan ${i + 1}`, options.length > MIN_OPTIONS_PG_KOMPLEKS))}
            {options.length < MAX_OPTIONS && (
              <button onClick={addOption} className="btn-ghost text-sm"><Plus size={14} /> Tambah pernyataan</button>
            )}
          </div>
        )}

        {type === "mcma" && (
          <div className="space-y-2">
            <label className="label">Pilihan (centang jawaban yang benar - bisa lebih dari satu)</label>
            {options.map((opt, i) => optionRow(opt, i, (
              <input type="checkbox" checked={Array.isArray(correctAnswer) && correctAnswer.includes(i)} onChange={(e) => {
                const ca = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
                if (e.target.checked) ca.push(i); else { const idx = ca.indexOf(i); if (idx >= 0) ca.splice(idx, 1); }
                setCorrectAnswer(ca.sort((a, b) => a - b));
              }} className="text-brand-600" />
            ), `Pilihan ${String.fromCharCode(65 + i)}`, options.length > MIN_OPTIONS_PG))}
            {options.length < MAX_OPTIONS && (
              <button onClick={addOption} className="btn-ghost text-sm"><Plus size={14} /> Tambah pilihan</button>
            )}
          </div>
        )}

        {type === "uraian" && (
          <div>
            <label className="label">Jawaban / Kunci (untuk referensi koreksi guru)</label>
            <textarea className="input min-h-[60px]" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="Kunci jawaban atau panduan koreksi..." />
          </div>
        )}

        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading || !content || !subjectId || !targetValue} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

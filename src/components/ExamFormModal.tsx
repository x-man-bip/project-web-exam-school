import { useEffect, useState } from "react";
import { Key } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buildTargetGroups, targetKeyForQuestion, targetToPayload } from "@/lib/questionTarget";
import type { ClassRoom, Exam, Subject } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/ui";

export function ExamFormModal({ exam, subjects, classes, onClose, onSaved }: {
  exam: Exam | null;
  subjects: Subject[];
  classes: ClassRoom[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState(exam?.title ?? "");
  const [description, setDescription] = useState(exam?.description ?? "");
  const [subjectId, setSubjectId] = useState(exam?.subject_id ?? "");
  const [targetValue, setTargetValue] = useState(exam ? targetKeyForQuestion(exam) : "");
  const [duration, setDuration] = useState(exam?.duration_minutes ?? 60);
  const [startTime, setStartTime] = useState(exam?.start_time ? new Date(exam.start_time).toISOString().slice(0, 16) : "");
  const [endTime, setEndTime] = useState(exam?.end_time ? new Date(exam.end_time).toISOString().slice(0, 16) : "");
  const [strictMode, setStrictMode] = useState(exam?.strict_mode ?? true);
  const [acakSoal, setAcakSoal] = useState(exam?.acak_soal ?? true);
  const [acakOpsi, setAcakOpsi] = useState(exam?.acak_opsi ?? true);
  const [shuffleMode, setShuffleMode] = useState<"all" | "per_subject">(exam?.shuffle_mode ?? "all");
  const [maxTabSwitches, setMaxTabSwitches] = useState(exam?.max_tab_switches ?? 3);
  const [accessToken, setAccessToken] = useState("");
  const [tokenReady, setTokenReady] = useState(!exam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exam) return;
    (async () => {
      const { data, error } = await supabase
        .from("exam_access_tokens")
        .select("token")
        .eq("exam_id", exam.id)
        .maybeSingle();
      if (error) {
        setError("Gagal memuat token ujian.");
        return;
      }
      if (data) setAccessToken(data.token);
      setTokenReady(true);
    })();
  }, [exam]);

  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let t = "";
    for (let i = 0; i < 8; i++) t += chars[Math.floor(Math.random() * chars.length)];
    setAccessToken(t);
  };

  const submit = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const payload = {
      teacher_id: profile.id, subject_id: subjectId, ...targetToPayload(targetValue),
      title, description, duration_minutes: duration,
      start_time: startTime ? new Date(startTime).toISOString() : null,
      end_time: endTime ? new Date(endTime).toISOString() : null,
      strict_mode: strictMode, max_tab_switches: maxTabSwitches,
      acak_soal: acakSoal, acak_opsi: acakOpsi, shuffle_mode: shuffleMode,
    };
    let examId = exam?.id ?? null;
    if (exam) {
      const res = await supabase.from("exams").update(payload).eq("id", exam.id);
      if (res.error) { setLoading(false); setError(res.error.message); return; }
    } else {
      const res = await supabase.from("exams").insert(payload).select("id").single();
      if (res.error || !res.data) { setLoading(false); setError(res.error?.message ?? "Gagal membuat ujian."); return; }
      examId = res.data.id;
    }
    const tokenRes = accessToken
      ? await supabase.from("exam_access_tokens").upsert({ exam_id: examId, token: accessToken })
      : await supabase.from("exam_access_tokens").delete().eq("exam_id", examId);
    setLoading(false);
    if (tokenRes.error) { setError("Ujian tersimpan, tetapi token gagal disimpan. Coba simpan ulang."); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={exam ? "Edit Ujian" : "Buat Ujian"} size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Judul Ujian</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="contoh: Ulangan Tengah Semester" />
        </div>
        <div>
          <label className="label">Deskripsi (opsional)</label>
          <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <label className="label">Kelas atau Tingkat</label>
            <select className="input" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
              <option value="">Pilih kelas atau tingkat...</option>
              {buildTargetGroups(classes).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Durasi (menit)</label>
            <input type="number" min="1" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Waktu Mulai (opsional)</label>
            <input type="datetime-local" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Kosongkan untuk mulai kapan saja</p>
          </div>
        </div>
        <div>
          <label className="label">Waktu Selesai (opsional)</label>
          <input type="datetime-local" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">Siswa tidak bisa mengakses ujian setelah waktu ini</p>
        </div>
        <div className="card bg-slate-50 border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Strict Mode (Anti-Cheating)</p>
              <p className="text-xs text-slate-400">Fullscreen, blokir tab switch, copy-paste, dll</p>
            </div>
            <button onClick={() => setStrictMode(!strictMode)} className={`relative w-12 h-6 rounded-full transition ${strictMode ? "bg-brand-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${strictMode ? "translate-x-6" : ""}`} />
            </button>
          </div>
          <div>
            <label className="label">Maks. Tab Switch sebelum auto-submit</label>
            <input type="number" min="1" className="input" value={maxTabSwitches} onChange={(e) => setMaxTabSwitches(Number(e.target.value))} disabled={!strictMode} />
          </div>
        </div>
        <div className="card bg-slate-50 border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Pengacakan Soal &amp; Opsi (Anti-Cheating)</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Acak urutan soal</p>
              <p className="text-xs text-slate-400">Setiap siswa mendapat urutan nomor soal berbeda</p>
            </div>
            <button onClick={() => setAcakSoal(!acakSoal)} className={`relative w-12 h-6 rounded-full transition ${acakSoal ? "bg-brand-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${acakSoal ? "translate-x-6" : ""}`} />
            </button>
          </div>
          {acakSoal && (
            <div>
              <label className="label">Mode pengacakan soal</label>
              <select className="input" value={shuffleMode} onChange={(e) => setShuffleMode(e.target.value === "per_subject" ? "per_subject" : "all")}>
                <option value="all">Acak semua soal gabungan</option>
                <option value="per_subject">Acak per kelompok mapel (urutan mapel tetap)</option>
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Acak urutan opsi jawaban</p>
              <p className="text-xs text-slate-400">Opsi A/B/C/D teracak per siswa; koreksi tetap akurat. Soal uraian tidak terpengaruh</p>
            </div>
            <button onClick={() => setAcakOpsi(!acakOpsi)} className={`relative w-12 h-6 rounded-full transition ${acakOpsi ? "bg-brand-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${acakOpsi ? "translate-x-6" : ""}`} />
            </button>
          </div>
        </div>
        <div className="card bg-brand-50/50 border-brand-100 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Token Akses Ujian</p>
            <p className="text-xs text-slate-400">Jika diisi, siswa harus memasukkan token ini untuk membuka soal. Kosongkan jika tidak perlu token.</p>
          </div>
          <div className="flex gap-2">
            <input className="input font-mono uppercase tracking-wider" value={accessToken} onChange={(e) => setAccessToken(e.target.value.toUpperCase())} placeholder="contoh: KIM7X2A9" maxLength={20} />
            <button type="button" onClick={generateToken} className="btn-secondary whitespace-nowrap">
              <Key size={16} /> Generate
            </button>
          </div>
        </div>
        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading || !tokenReady || !title || !subjectId || !targetValue} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

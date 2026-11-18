import { useEffect, useState } from "react";
import { Plus, Download, RotateCcw, Printer } from "lucide-react";
import { navigate } from "@/lib/router";
import { supabase } from "@/lib/supabase";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { Spinner } from "@/components/ui";
import { ParticipantCardPrint } from "@/components/dashboard/ParticipantCardPrint";
import type { Exam } from "@/lib/types";

export function QuickActionsCard() {
  const [showResetAll, setShowResetAll] = useState(false);
  const [showCardPrint, setShowCardPrint] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("exams")
        .select("*, subject:subjects(*), class:classes(*)")
        .in("status", ["active", "published"])
        .order("created_at", { ascending: false });
      setExams((data as Exam[]) ?? []);
      setLoadingExams(false);
    })();
  }, []);

  const selectedExam = exams.find((e) => e.id === selectedExamId) ?? null;

  const handleResetAll = async () => {
    if (!selectedExamId) return;
    setResetting(true);
    setResetResult(null);
    const { data, error: rpcError } = await supabase.rpc("reset_all_attempts", { p_exam_id: selectedExamId });
    if (rpcError) {
      setResetResult(`Gagal: ${rpcError.message}`);
    } else {
      const count = typeof data === "number" ? data : 0;
      setResetResult(`Berhasil mereset ${count} sesi siswa. Semua siswa kini dapat login kembali tanpa kehilangan jawaban draft.`);
    }
    setResetting(false);
    setShowResetAll(false);
  };

  return (
    <section className="card p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Aksi Cepat</h2>
      <div className="grid grid-cols-1 gap-2">
        <button onClick={() => navigate("/admin/ujian")} className="btn-primary justify-start">
          <Plus size={18} /> Buat Ujian Baru
        </button>
        <button onClick={() => setShowCardPrint(true)} className="btn-secondary justify-start">
          <Printer size={18} /> Cetak Kartu Peserta
        </button>
        <button onClick={() => navigate("/admin/grades")} className="btn-secondary justify-start">
          <Download size={18} /> Export Rekap Nilai
        </button>
        <button onClick={() => setShowResetAll(true)} className="btn-secondary justify-start text-warning-700 hover:bg-warning-50">
          <RotateCcw size={18} /> Reset Sesi All
        </button>
      </div>

      {/* Reset Sesi All Modal */}
      <Modal open={showResetAll} onClose={() => { setShowResetAll(false); setResetResult(null); }} title="Reset Sesi Semua Siswa" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Pilih ujian untuk mereset status semua siswa yang sedang mengerjakan menjadi "Siap Login".
            Jawaban draft siswa tetap tersimpan dan tidak hilang.
          </p>
          {loadingExams ? (
            <div className="flex justify-center py-4"><Spinner size={20} /></div>
          ) : exams.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Belum ada ujian yang dipublikasikan.</p>
          ) : (
            <select
              className="input"
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
            >
              <option value="">Pilih ujian...</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} — {ex.subject?.name ?? ""}
                </option>
              ))}
            </select>
          )}
          {resetResult && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${resetResult.startsWith("Berhasil") ? "bg-success-50 border-success-200 text-success-700" : "bg-error-50 border-error-200 text-error-700"}`}>
              {resetResult}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowResetAll(false)} className="btn-secondary">Batal</button>
            <button
              onClick={handleResetAll}
              disabled={!selectedExamId || resetting}
              className="btn-danger"
            >
              {resetting ? <Spinner size={16} /> : <RotateCcw size={16} />} Ya, Reset Semua
            </button>
          </div>
        </div>
      </Modal>

      {/* Cetak Kartu Peserta Modal */}
      {showCardPrint && (
        loadingExams ? (
          <Modal open={true} onClose={() => setShowCardPrint(false)} title="Cetak Kartu Peserta" size="sm">
            <div className="flex justify-center py-8"><Spinner size={24} /></div>
          </Modal>
        ) : exams.length === 0 ? (
          <Modal open={true} onClose={() => setShowCardPrint(false)} title="Cetak Kartu Peserta" size="sm">
            <div className="text-center py-8 text-slate-400">
              <p>Belum ada ujian yang dipublikasikan.</p>
            </div>
          </Modal>
        ) : selectedExam ? (
          <ParticipantCardPrint exam={selectedExam} onClose={() => { setShowCardPrint(false); setSelectedExamId(""); }} />
        ) : (
          <Modal open={true} onClose={() => setShowCardPrint(false)} title="Pilih Ujian untuk Cetak Kartu" size="sm">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Pilih ujian untuk mencetak kartu peserta seluruh siswa yang terdaftar.</p>
              <select
                className="input"
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
              >
                <option value="">Pilih ujian...</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} — {ex.subject?.name ?? ""}
                  </option>
                ))}
              </select>
            </div>
          </Modal>
        )
      )}
    </section>
  );
}

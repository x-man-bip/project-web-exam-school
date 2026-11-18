import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Printer, X, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/lib/schoolSettings";
import { Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Exam, ExamParticipant } from "@/lib/types";

interface ParticipantCardPrintProps {
  exam: Exam;
  onClose: () => void;
}

export function ParticipantCardPrint({ exam, onClose }: ParticipantCardPrintProps) {
  const { settings } = useSchoolSettings();
  const [participants, setParticipants] = useState<ExamParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("get_exam_participants", { p_exam_id: exam.id });
      if (rpcError) {
        setError(`Gagal memuat peserta: ${rpcError.message}`);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as ExamParticipant[];
      setParticipants(rows);

      const codes: Record<string, string> = {};
      for (const p of rows) {
        const payload = JSON.stringify({
          exam: exam.title,
          student_id: p.r_student_id,
          name: p.r_full_name,
          identifier: p.r_identifier,
        });
        try {
          codes[p.r_student_id] = await QRCode.toDataURL(payload, { width: 120, margin: 0 });
        } catch {
          codes[p.r_student_id] = "";
        }
      }
      setQrUrls(codes);
      setLoading(false);
    })();
  }, [exam.id, exam.title]);

  const schoolName = settings?.school_name ?? "Sekolah";
  const academicYear = settings?.academic_year ?? "";
  const examDate = exam.start_time
    ? new Date(exam.start_time).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : "-";

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={true} onClose={onClose} title="Cetak Kartu Peserta" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 no-print">
          <div>
            <p className="text-sm text-slate-500">
              {exam.title} — {exam.subject?.name ?? ""}
            </p>
            <p className="text-xs text-slate-400">
              {participants.length} peserta
            </p>
          </div>
          <button onClick={handlePrint} disabled={loading || participants.length === 0} className="btn-primary">
            <Printer size={18} /> Cetak / PDF
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : error ? (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>
        ) : participants.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <X size={32} className="mx-auto mb-2" />
            <p>Tidak ada peserta terdaftar untuk ujian ini.</p>
          </div>
        ) : (
          <div ref={printRef} className="print-area">
            {/* Print header — only visible when printing */}
            <div className="hidden print:block print-header">
              {settings?.logo_url && <img src={settings.logo_url} alt="Logo" className="print-logo" />}
              <div className="print-header-text">
                <h1 className="text-lg font-bold">{schoolName}</h1>
                <p className="text-sm">Kartu Peserta Ujian — {exam.title}</p>
                <p className="text-xs">Tahun Ajaran {academicYear}</p>
              </div>
            </div>

            {/* Card grid — 2 columns on screen, 4 columns on print A4 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 print-grid">
              {participants.map((p, i) => (
                <div key={p.r_student_id} className="participant-card">
                  <div className="card-border">
                    <div className="card-header">
                      <span className="text-[10px] font-bold uppercase tracking-wide">Kartu Peserta</span>
                      <span className="text-[9px]">No. {String(i + 1).padStart(3, "0")}</span>
                    </div>
                    <div className="card-body">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                          {p.r_full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{p.r_full_name}</p>
                          <p className="text-[9px] text-slate-500">{p.r_class_name ?? "-"}</p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-0.5 text-[9px] text-slate-600">
                        <div className="flex justify-between">
                          <span>No. Peserta:</span>
                          <span className="font-mono font-semibold">{p.r_identifier ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mapel:</span>
                          <span className="font-medium truncate ml-1">{exam.subject?.name ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tanggal:</span>
                          <span className="font-medium">{examDate}</span>
                        </div>
                      </div>
                      {qrUrls[p.r_student_id] && (
                        <div className="mt-2 flex justify-center">
                          <img src={qrUrls[p.r_student_id]} alt="QR" className="w-16 h-16" />
                        </div>
                      )}
                    </div>
                    <div className="card-footer">
                      <span className="text-[8px]">{schoolName}</span>
                      <span className="text-[8px]">{academicYear}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useRef, useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, FileType, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buildTargetGroups } from "@/lib/questionTarget";
import { type ClassRoom, type Subject } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { downloadImportTemplate, parseImportRow, readExcelRows, type ImportRow } from "@/lib/questionImport";

const ACCEPTED_PATTERN = /\.(xlsx|xls|csv|docx)$/i;

interface ImportResult {
  succeeded: number;
  failed: number;
  total: number;
}

/** Extract soal dari dokumen Word. Gambar dari .docx disisipkan sebagai URL data; guru bisa menggantinya lewat editor. */
async function readWordRows(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const convertOptions = {
    convertImage: mammoth.images.imgElement(async (image: { read: (enc: string) => Promise<Buffer> }) => {
      const buf = await image.read("base64");
      return { src: `data:image/png;base64,${buf}` };
    }),
  };
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer }, convertOptions);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = Array.from(doc.body.querySelectorAll("p,h1,h2,h3,h4,h5,h6"));
  const rows: ImportRow[] = [];
  for (const p of paragraphs) {
    const text = p.textContent?.trim() ?? "";
    const img = p.querySelector("img");
    const src = img?.getAttribute("src") ?? null;
    if (!text && !src) continue;
    const images: Record<string, string> = {};
    if (src && src.startsWith("data:image")) images["url_gambar_soal"] = src;
    rows.push({ values: { soal: text, tipe: "pg", kunci: "" }, images });
  }
  return rows;
}

export function QuestionImportModal({ subjects, classes, onClose, onImported }: {
  subjects: Subject[];
  classes: ClassRoom[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [results, setResults] = useState<ImportResult | null>(null);
  const [defaultSubject, setDefaultSubject] = useState("");
  const [defaultTarget, setDefaultTarget] = useState("");

  const handleFile = async (file: File) => {
    setError(null);
    setResults(null);
    if (!ACCEPTED_PATTERN.test(file.name)) {
      setError("Format file tidak didukung. Gunakan .xlsx, .xls, .csv, atau .docx.");
      return;
    }
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const isWord = /\.docx$/i.test(file.name);
      const rows = isWord ? await readWordRows(buf) : readExcelRows(buf);
      const defaults = { subjects, classes, defaultSubjectId: defaultSubject, defaultTarget };
      let succeeded = 0;
      let failed = 0;
      for (const row of rows) {
        const parsed = parseImportRow(row, defaults);
        if (!parsed) { failed++; continue; }
        const payload = {
          teacher_id: profile?.id,
          ...parsed,
          verification_status: "draft" as const,
        };
        const { error: insErr } = await supabase.from("questions").insert(payload);
        if (insErr) { failed++; } else { succeeded++; }
      }
      setResults({ succeeded, failed, total: rows.length });
      if (succeeded > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses file");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !loading) handleFile(file);
  };

  return (
    <Modal open={true} onClose={onClose} title="Import Soal (Excel/CSV/Word)" size="lg">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Belum punya format file?</p>
            <p>Unduh template, isi soal di baris berikutnya, lalu unggah kembali.</p>
          </div>
          <button onClick={downloadImportTemplate} className="btn-secondary shrink-0">
            <Download size={16} /> Unduh Template Excel
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium mb-1">Kolom yang didukung (Excel/CSV):</p>
          <p className="font-mono text-xs leading-relaxed">Soal, Tipe, Poin, Mapel, Kelas, Opsi A-E, Kunci, url_gambar_soal, url_gambar_opsi_a s/d url_gambar_opsi_e</p>
          <p className="mt-2 text-xs text-slate-500">Format: .xlsx, .xls, .csv, atau .docx. Pada Word, tiap paragraf menjadi satu soal dan gambar di dalamnya ikut tersimpan.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Mapel Default</label>
            <select className="input" value={defaultSubject} onChange={(e) => setDefaultSubject(e.target.value)}>
              <option value="">Pilih...</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Kelas Default</label>
            <select className="input" value={defaultTarget} onChange={(e) => setDefaultTarget(e.target.value)}>
              <option value="">Pilih...</option>
              {buildTargetGroups(classes).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
        <div
          onClick={() => !loading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!loading) setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50"
          } ${loading ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
            {loading ? <Spinner size={24} /> : dragActive ? <FileSpreadsheet size={26} /> : <Upload size={26} />}
          </div>
          <div>
            <p className="font-semibold text-slate-800">{dragActive ? "Lepaskan file di sini" : "Seret file ke sini atau klik untuk memilih"}</p>
            <p className="mt-1 text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <FileSpreadsheet size={12} /> Excel/CSV <span className="text-slate-300">|</span> <FileType size={12} /> Word
            </p>
          </div>
        </div>

        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>}
        {results && (
          <div className="rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700">
            Berhasil: {results.succeeded} | Gagal: {results.failed} | Total baris: {results.total}
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
        </div>
      </div>
    </Modal>
  );
}

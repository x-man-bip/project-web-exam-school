import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import { isHttpUrl, uploadQuestionImage, QUESTION_IMAGE_MIME_TYPES } from "@/lib/questionImages";

interface QuestionImagePickerProps {
  value: string | null;
  onChange: (url: string | null) => void;
  ownerId: string;
  label: string;
  variant?: "block" | "compact";
}

export function QuestionImagePicker({ value, onChange, ownerId, label, variant = "block" }: QuestionImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadQuestionImage(file, ownerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gambar gagal diunggah.");
    } finally {
      setUploading(false);
    }
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!isHttpUrl(trimmed)) {
      setError("URL gambar harus diawali http:// atau https://");
      return;
    }
    setError(null);
    onChange(trimmed);
    setUrlDraft("");
    setShowUrl(false);
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={QUESTION_IMAGE_MIME_TYPES.join(",")}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = "";
      }}
    />
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5">
        {fileInput}
        {value ? (
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -right-1 -top-1 rounded-full bg-error-600 p-0.5 text-white shadow hover:bg-error-700"
              title="Hapus Gambar"
              aria-label="Hapus Gambar"
            >
              <X size={10} />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
          title={value ? "Ganti gambar" : "Tambah gambar"}
          aria-label={value ? "Ganti gambar" : "Tambah gambar"}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        </button>
        {error && <span className="text-xs text-error-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="label mb-0">{label}</p>
      {fileInput}
      {value ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <img src={value} alt={label} className="max-h-40 max-w-full rounded-md border border-slate-200 bg-white object-contain" />
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary text-xs px-3 py-1.5">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Ganti
            </button>
            <button type="button" onClick={() => onChange(null)} className="btn-ghost text-xs px-3 py-1.5 text-error-600 hover:bg-error-50">
              <X size={14} /> Hapus Gambar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Opsional. PNG, JPG, WEBP, atau GIF, maksimal 5 MB.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary text-xs px-3 py-1.5">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Unggah
            </button>
            <button type="button" onClick={() => setShowUrl((v) => !v)} className="btn-ghost text-xs px-3 py-1.5">
              <Link2 size={14} /> URL
            </button>
          </div>
        </div>
      )}
      {showUrl && !value && (
        <div className="flex gap-2">
          <input className="input text-sm" placeholder="https://..." value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} />
          <button type="button" onClick={applyUrl} disabled={!urlDraft.trim()} className="btn-primary text-xs px-3">Pakai</button>
        </div>
      )}
      {error && <p className="text-xs text-error-600">{error}</p>}
    </div>
  );
}

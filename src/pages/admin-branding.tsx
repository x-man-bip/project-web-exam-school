import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ImagePlus, Save, CheckCircle, AlertCircle, Trash2, RotateCcw,
  Palette, Users, Sparkles, Shield, Network, Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/lib/schoolSettings";
import { Spinner } from "@/components/ui";
import { ColorPicker } from "@/components/branding/ColorPicker";
import {
  DEFAULT_THEME, GRADIENT_DIRECTIONS, GRADIENT_PRESETS, ROLE_KEYS, ROLE_LABELS,
  applyThemeToDocument, fillValue, normalizeTheme, type GradientDirection, type RoleKey, type ThemeConfig,
} from "@/lib/themeConfig";

const BUCKET = "school-branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function AdminBranding() {
  const { settings, loading, refresh } = useSchoolSettings();
  const [schoolName, setSchoolName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [requireSeb, setRequireSeb] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSchoolName(settings.school_name);
    setAcademicYear(settings.academic_year);
    setTheme(settings.theme);
    setIpAllowlist(settings.ip_allowlist ?? "");
    setRequireSeb(settings.require_seb ?? false);
  }, [settings]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Live preview: apply draft theme to document, restore on unmount
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (settings) applyThemeToDocument(settings.theme);
    };
  }, [settings]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setSaved(false);
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!LOGO_EXTENSIONS[selected.type]) {
      setError("Format logo harus PNG, JPG, WebP, atau SVG.");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_LOGO_BYTES) {
      setError("Ukuran logo maksimal 2 MB.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(selected);
  };

  const updateTheme = (patch: Partial<ThemeConfig>) => {
    setTheme((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const updateRoleAccent = (key: RoleKey, field: "color" | "accent", hex: string) => {
    setTheme((prev) => ({
      ...prev,
      roles: { ...prev.roles, [key]: { ...prev.roles[key], [field]: hex } },
    }));
    setSaved(false);
  };

  const applyPreset = (start: string, end: string) => {
    setTheme((prev) => ({
      ...prev,
      mode: "gradient",
      stopStart: start,
      stopEnd: end,
      primary: start,
      secondary: end,
    }));
    setSaved(false);
  };

  const handleResetTheme = () => {
    setTheme(DEFAULT_THEME);
    setSaved(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    let logoUrl = settings?.logo_url ?? null;
    if (file) {
      const path = `logo-${Date.now()}.${LOGO_EXTENSIONS[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError(`Logo gagal diunggah: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      logoUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const { data, error: saveError } = await supabase
      .from("school_settings")
      .update({
        school_name: schoolName.trim(),
        academic_year: academicYear.trim(),
        logo_url: logoUrl,
        theme,
        ip_allowlist: ipAllowlist.trim(),
        require_seb: requireSeb,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("id");

    if (saveError || !data || data.length === 0) {
      setError(saveError?.message ?? "Pengaturan belum tersimpan. Coba lagi.");
      setSaving(false);
      return;
    }

    await refresh();
    setFile(null);
    setSaving(false);
    setSaved(true);
  };

  const handleRemoveLogo = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { data, error: saveError } = await supabase
      .from("school_settings")
      .update({ logo_url: null, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("id");

    if (saveError || !data || data.length === 0) {
      setError(saveError?.message ?? "Logo belum bisa dihapus. Coba lagi.");
      setSaving(false);
      return;
    }

    await refresh();
    setSaving(false);
    setSaved(true);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  const currentLogo = settings?.logo_url ?? null;
  const shownLogo = previewUrl ?? currentLogo;
  const brandFill = fillValue(theme);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Branding Sekolah</h1>
        <p className="text-sm text-slate-500 mt-1">
          Nama sekolah, logo, dan tema warna yang tampil di seluruh dashboard.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identitas Sekolah */}
        <section className="card p-6 space-y-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-800">Identitas Sekolah</h2>
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="school-name">Nama Lengkap Sekolah</label>
              <input
                id="school-name"
                className="input"
                placeholder="Contoh: SMA Negeri 1 Nama Kota"
                value={schoolName}
                onChange={(e) => { setSchoolName(e.target.value); setSaved(false); }}
                maxLength={120}
              />
            </div>
            <div>
              <label className="label" htmlFor="academic-year">Tahun Ajaran</label>
              <input
                id="academic-year"
                className="input"
                placeholder="Contoh: 2026/2027"
                value={academicYear}
                onChange={(e) => { setAcademicYear(e.target.value); setSaved(false); }}
                maxLength={20}
              />
            </div>
          </div>

          <div>
            <p className="label">Logo Sekolah</p>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-28 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {shownLogo ? (
                  <img src={shownLogo} alt="Pratinjau logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <ImagePlus size={28} className="text-slate-300" />
                )}
              </div>
              <div className="space-y-3 flex-1">
                <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition">
                  <ImagePlus size={18} />
                  {file ? file.name : currentLogo ? "Ganti logo" : "Pilih file logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="text-xs text-slate-400">PNG, JPG, WebP, atau SVG. Maksimal 2 MB.</p>
                {currentLogo && !file && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-error-600 hover:text-error-700 transition disabled:opacity-60"
                  >
                    <Trash2 size={14} /> Hapus logo
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Tema Warna & Gradien */}
        <section className="card p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Palette size={20} className="text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-800">Tema Warna & Gradien</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <ColorPicker
                  label="Warna Utama (Primary)"
                  value={theme.primary}
                  onChange={(hex) => updateTheme({ primary: hex })}
                />
                <ColorPicker
                  label="Warna Sekunder (Secondary)"
                  value={theme.secondary}
                  onChange={(hex) => updateTheme({ secondary: hex })}
                />
              </div>

              {/* Mode toggle */}
              <div>
                <p className="label">Mode Tema</p>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <ModeButton
                    active={theme.mode === "solid"}
                    onClick={() => updateTheme({ mode: "solid" })}
                    label="Solid Color"
                  />
                  <ModeButton
                    active={theme.mode === "gradient"}
                    onClick={() => updateTheme({ mode: "gradient" })}
                    label="Gradient Theme"
                  />
                </div>
              </div>

              {/* Gradient customizer */}
              {theme.mode === "gradient" && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 animate-fade-in">
                  <div>
                    <label className="label" htmlFor="grad-direction">Arah Gradien</label>
                    <select
                      id="grad-direction"
                      className="input"
                      value={theme.direction}
                      onChange={(e) => updateTheme({ direction: e.target.value as GradientDirection })}
                    >
                      {GRADIENT_DIRECTIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <ColorPicker
                      label="Color Stop 1"
                      value={theme.stopStart}
                      onChange={(hex) => updateTheme({ stopStart: hex })}
                      checkContrast={false}
                    />
                    <ColorPicker
                      label="Color Stop 2"
                      value={theme.stopEnd}
                      onChange={(hex) => updateTheme({ stopEnd: hex })}
                      checkContrast={false}
                    />
                  </div>

                  {/* Preset Gallery */}
                  <div>
                    <p className="label flex items-center gap-1.5">
                      <Sparkles size={14} /> Preset Gradien
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {GRADIENT_PRESETS.map((preset) => {
                        const active =
                          theme.stopStart.toLowerCase() === preset.start.toLowerCase() &&
                          theme.stopEnd.toLowerCase() === preset.end.toLowerCase();
                        return (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => applyPreset(preset.start, preset.end)}
                            className={`group rounded-lg border-2 p-2 text-left transition ${
                              active ? "border-brand-600 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div
                              className="h-10 w-full rounded-md mb-1.5"
                              style={{ background: `linear-gradient(to right, ${preset.start}, ${preset.end})` }}
                            />
                            <p className="text-xs font-medium text-slate-600">{preset.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Preview */}
            <div>
              <p className="label mb-3">Pratinjau Langsung</p>
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Sidebar preview */}
                <div className="flex">
                  <div className="w-32 bg-white border-r border-slate-200 p-2 space-y-1">
                    <div className="h-6 rounded brand-fill" />
                    <div className="flex items-center gap-1.5 px-1.5 py-1.5 rounded text-[10px] font-medium text-slate-400">
                      <div className="w-3 h-3 rounded bg-slate-200" /> Menu
                    </div>
                    <div className="flex items-center gap-1.5 px-1.5 py-1.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700">
                      <div className="w-3 h-3 rounded bg-brand-600" /> Dashboard
                    </div>
                    <div className="flex items-center gap-1.5 px-1.5 py-1.5 rounded text-[10px] font-medium text-slate-400">
                      <div className="w-3 h-3 rounded bg-slate-200" /> Ujian
                    </div>
                  </div>

                  {/* Content preview */}
                  <div className="flex-1 bg-slate-50 p-3 space-y-2.5">
                    {/* Primary button */}
                    <button
                      type="button"
                      className="btn-primary text-xs px-3 py-1.5"
                      style={{ background: brandFill }}
                    >
                      Tombol Aksi Utama
                    </button>

                    {/* Exam card with gradient header */}
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <div className="px-3 py-2 text-white text-[10px] font-semibold" style={{ background: brandFill }}>
                        Ujian Semester Ganjil 2026
                      </div>
                      <div className="px-3 py-2.5 space-y-2">
                        <div className="flex gap-1.5">
                          <span className="badge bg-success-100 text-success-700 text-[9px]">Aktif</span>
                          <span className="badge bg-warning-100 text-warning-700 text-[9px]">60 menit</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: brandFill, width: "65%" }} />
                        </div>
                      </div>
                    </div>

                    {/* Kop accent line */}
                    <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                      <div className="h-1 w-full rounded-full mb-2" style={{ background: brandFill }} />
                      <p className="text-[9px] text-slate-400">Kop Header Accent Line</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Role Accents */}
        <section className="card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-brand-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Indikator Warna Level Akun</h2>
              <p className="text-sm text-slate-500">
                Warna tetap memakai tema utama yang sama, tetapi avatar dan badge peran memakai warna khas ini.
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {ROLE_KEYS.map((key) => (
                <div key={key} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">{ROLE_LABELS[key]}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <ColorPicker
                      label="Warna Utama"
                      value={theme.roles[key].color}
                      onChange={(hex) => updateRoleAccent(key, "color", hex)}
                      checkContrast={false}
                    />
                    <ColorPicker
                      label="Warna Aksen"
                      value={theme.roles[key].accent}
                      onChange={(hex) => updateRoleAccent(key, "accent", hex)}
                      checkContrast={false}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Role preview */}
            <div>
              <p className="label mb-3">Pratinjau Peran</p>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {ROLE_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3 rounded-lg bg-white border border-slate-200 p-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white role-avatar-${key}`}
                    >
                      {ROLE_LABELS[key][0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">
                        {key === "admin" ? "Dr. Ahmad Saputra" : key === "teacher" ? "Siti Rahma, S.Pd." : "Budi Hartono"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`badge text-[9px] role-chip-${key}`}>{ROLE_LABELS[key]}</span>
                        <span className="badge bg-success-100 text-success-700 text-[9px]">Online</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <p className="text-[10px] text-slate-400 text-center">
                    Tombol aksi utama tetap memakai tema sekolah:
                  </p>
                  <button
                    type="button"
                    className="btn-primary w-full mt-1.5 text-xs"
                    style={{ background: brandFill }}
                  >
                    Tombol Aksi (Tema Sekolah)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Keamanan Ujian */}
        <section className="card p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-brand-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Keamanan Ujian</h2>
              <p className="text-sm text-slate-500">
                Batasi akses ujian berdasarkan jaringan dan lingkungan browser yang aman.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* IP Allowlist */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-slate-400" />
                <label className="label mb-0" htmlFor="ip-allowlist">Daftar IP / Jaringan Sekolah</label>
              </div>
              <p className="text-xs text-slate-400">
                Masukkan alamat IP atau rentang CIDR (satu per baris). Jika diisi, siswa hanya dapat mengakses ujian dari jaringan ini. Kosongkan untuk mengizinkan semua jaringan.
              </p>
              <textarea
                id="ip-allowlist"
                className="input font-mono text-sm min-h-[100px]"
                placeholder={"192.168.1.0/24\n10.0.0.0/16\n203.142.80.10"}
                value={ipAllowlist}
                onChange={(e) => { setIpAllowlist(e.target.value); setSaved(false); }}
              />
              <p className="text-xs text-slate-400">
                Contoh: <code className="bg-slate-100 px-1 rounded">192.168.1.0/24</code> untuk seluruh subnet sekolah, atau <code className="bg-slate-100 px-1 rounded">203.142.80.10</code> untuk satu IP.
              </p>
            </div>

            {/* SEB Toggle */}
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Lock size={18} className="text-slate-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700">Wajibkan Safe Exam Browser</p>
                <p className="text-xs text-slate-400 mt-1">
                  Jika diaktifkan, ujian mode strict hanya bisa dibuka melalui Safe Exam Browser (SEB). Siswa yang membuka dari browser biasa akan ditolak.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={requireSeb}
                  onChange={(e) => { setRequireSeb(e.target.checked); setSaved(false); }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
              </label>
            </div>
          </div>
        </section>

        {/* Error / Success */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700">
            <CheckCircle size={18} />
            <span>Pengaturan branding berhasil disimpan.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <button
            type="button"
            onClick={handleResetTheme}
            disabled={saving}
            className="btn-secondary inline-flex items-center justify-center gap-2"
          >
            <RotateCcw size={18} />
            Reset Warna ke Default
          </button>
          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2">
            {saving ? <Spinner size={18} /> : <Save size={18} />}
            Simpan Branding
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
        active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

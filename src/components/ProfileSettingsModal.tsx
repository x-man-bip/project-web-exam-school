import { useRef, useState } from "react";
import {
  Camera, Check, Lock, Eye, EyeOff, AlertCircle, Upload, Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/ui";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ImageCropper } from "@/components/ImageCropper";
import { uploadAvatar, removeAvatar, validateAvatar } from "@/lib/avatar";
import { useExamInProgress } from "@/lib/examLock";

type Tab = "avatar" | "password";

export function ProfileSettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>("avatar");

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [cropping, setCropping] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const examInProgress = useExamInProgress(profile?.id, "");

  if (!profile) return null;

  if (examInProgress) {
    return (
      <Modal open={true} onClose={onClose} title="Pengaturan Profil" size="md">
        <div className="flex items-start gap-3 rounded-lg bg-warning-50 border border-warning-200 p-4 text-sm text-warning-800">
          <Lock size={18} className="mt-0.5 shrink-0" />
          <p>Ganti password dan foto profil tidak tersedia selama ujian berlangsung. Silakan selesaikan ujian terlebih dahulu.</p>
        </div>
      </Modal>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = validateAvatar(file);
    if (problem) {
      setAvatarMsg({ ok: false, text: problem });
      return;
    }
    setRawFile(file);
    setCropping(true);
    // reset any previously selected/cropped file
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleCropConfirm = (croppedFile: File) => {
    setSelectedFile(croppedFile);
    setPreviewUrl(URL.createObjectURL(croppedFile));
    setCropping(false);
    setRawFile(null);
  };

  const handleCropCancel = () => {
    setCropping(false);
    setRawFile(null);
  };

  const handleUploadAvatar = async () => {
    if (!selectedFile) return;
    setAvatarLoading(true);
    setAvatarMsg(null);
    try {
      await uploadAvatar(selectedFile);
      await refreshProfile();
      setAvatarMsg({ ok: true, text: "Foto profil berhasil diperbarui." });
      setSelectedFile(null);
      setPreviewUrl(null);
      setCropping(false);
      setRawFile(null);
    } catch (err) {
      setAvatarMsg({ ok: false, text: err instanceof Error ? err.message : "Gagal mengunggah foto." });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarLoading(true);
    setAvatarMsg(null);
    try {
      await removeAvatar();
      await refreshProfile();
      setAvatarMsg({ ok: true, text: "Foto profil telah dihapus." });
    } catch {
      setAvatarMsg({ ok: false, text: "Gagal menghapus foto profil." });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwMsg({ ok: false, text: "Semua kolom wajib diisi." });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: "Password baru minimal 8 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "Konfirmasi password tidak cocok dengan password baru." });
      return;
    }
    if (newPassword === currentPassword) {
      setPwMsg({ ok: false, text: "Password baru harus berbeda dari password saat ini." });
      return;
    }

    setPwLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) {
      setPwMsg({ ok: false, text: "Sesi tidak valid. Silakan login kembali." });
      setPwLoading(false);
      return;
    }
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      },
    );
    const data = await res.json();
    setPwLoading(false);
    if (!res.ok) {
      setPwMsg({ ok: false, text: data.error ?? "Gagal mengubah password." });
      return;
    }
    setPwMsg({ ok: true, text: "Password berhasil diubah. Gunakan password baru saat login berikutnya." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const passwordField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    show: boolean,
    toggleShow: () => void,
    placeholder: string,
  ) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type={show ? "text" : "password"}
          className="input pl-9 pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={toggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          aria-label={show ? "Sembunyikan" : "Tampilkan"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  const displayAvatar = previewUrl ?? profile.avatar_url;

  return (
    <Modal open={true} onClose={onClose} title="Pengaturan Profil" size="md">
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setTab("avatar")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              tab === "avatar" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Camera size={16} /> Foto Profil
          </button>
          <button
            onClick={() => setTab("password")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              tab === "password" ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Lock size={16} /> Password
          </button>
        </div>

        {/* Avatar tab */}
        {tab === "avatar" && (
          <div className="space-y-4">
            {cropping && rawFile ? (
              <ImageCropper
                file={rawFile}
                onCancel={handleCropCancel}
                onConfirm={handleCropConfirm}
              />
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative">
                    {displayAvatar ? (
                      <img
                        src={displayAvatar}
                        alt={profile.full_name}
                        className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-md"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-brand-100 flex items-center justify-center text-3xl font-bold text-brand-600 border-4 border-white shadow-md">
                        {profile.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg hover:bg-brand-700 transition"
                      aria-label="Pilih foto"
                    >
                      <Camera size={16} />
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <p className="text-xs text-slate-400 text-center">
                    Format PNG, JPG, atau WEBP. Maksimal 2 MB. Anda dapat memotong foto sebelum disimpan.
                  </p>
                </div>

                {selectedFile && (
                  <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 flex items-center gap-2">
                    <Upload size={16} className="text-brand-500 shrink-0" />
                    <p className="text-sm text-brand-700 flex-1 truncate">Foto siap disimpan</p>
                    <button
                      onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                      className="text-xs text-slate-400 hover:text-error-500"
                    >
                      Batal
                    </button>
                  </div>
                )}

                {avatarMsg && (
                  <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
                    avatarMsg.ok
                      ? "bg-success-50 border-success-200 text-success-700"
                      : "bg-error-50 border-error-200 text-error-700"
                  }`}>
                    {avatarMsg.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                    {avatarMsg.text}
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary flex-1"
                    disabled={avatarLoading}
                  >
                    <Upload size={16} /> Pilih Foto
                  </button>
                  {selectedFile && (
                    <button
                      onClick={handleUploadAvatar}
                      className="btn-primary flex-1"
                      disabled={avatarLoading}
                    >
                      {avatarLoading ? <Spinner size={16} /> : <Check size={16} />} Simpan Foto
                    </button>
                  )}
                  {profile.avatar_url && !selectedFile && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="btn-secondary text-error-600 hover:bg-error-50"
                      disabled={avatarLoading}
                    >
                      <Trash2 size={16} /> Hapus
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Password tab */}
        {tab === "password" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                Password baru minimal 8 karakter. Gunakan kombinasi huruf, angka, dan simbol untuk keamanan optimal.
              </p>
            </div>

            {passwordField("Password Saat Ini", currentPassword, setCurrentPassword, showCurrent, () => setShowCurrent(!showCurrent), "Masukkan password saat ini")}
            {passwordField("Password Baru", newPassword, setNewPassword, showNew, () => setShowNew(!showNew), "Masukkan password baru")}
            {passwordField("Konfirmasi Password Baru", confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm(!showConfirm), "Ulangi password baru")}

            {pwMsg && (
              <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
                pwMsg.ok
                  ? "bg-success-50 border-success-200 text-success-700"
                  : "bg-error-50 border-error-200 text-error-700"
              }`}>
                {pwMsg.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                {pwMsg.text}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleChangePassword}
                disabled={pwLoading}
                className="btn-primary"
              >
                {pwLoading ? <Spinner size={16} /> : null} Simpan Password
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

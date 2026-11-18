import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import type { SetupFieldErrors, SetupFormValues } from "@/lib/setup";
import { SetupField, setupInputClass } from "./SetupField";

interface AdminAccountStepProps {
  values: SetupFormValues;
  confirmPassword: string;
  errors: SetupFieldErrors;
  onChange: (field: keyof SetupFormValues, value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
}

export function AdminAccountStep({
  values, confirmPassword, errors, onChange, onConfirmPasswordChange,
}: AdminAccountStepProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Akun Kepala Sekolah</h2>
          <p className="mt-1 text-sm text-slate-500">
            Akun ini memiliki akses penuh untuk mengelola guru, siswa, dan seluruh pengaturan sekolah.
          </p>
        </div>
      </div>

      <SetupField label="Nama Lengkap" htmlFor="adminName" error={errors.adminName}>
        <input
          id="adminName"
          type="text"
          autoComplete="name"
          className={setupInputClass}
          placeholder="Dr. Budi Santoso, M.Pd."
          value={values.adminName}
          onChange={(e) => onChange("adminName", e.target.value)}
          maxLength={100}
          required
        />
      </SetupField>

      <SetupField label="NIP / Username" htmlFor="identifier" error={errors.identifier}>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          className={setupInputClass}
          placeholder="198501012010011001"
          value={values.identifier}
          onChange={(e) => onChange("identifier", e.target.value)}
          maxLength={50}
          required
        />
      </SetupField>

      <SetupField label="Email" htmlFor="email" error={errors.email} hint="Email ini digunakan untuk masuk ke aplikasi.">
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={setupInputClass}
          placeholder="kepsek@sekolah.sch.id"
          value={values.email}
          onChange={(e) => onChange("email", e.target.value)}
          required
        />
      </SetupField>

      <SetupField label="Password" htmlFor="password" error={errors.password} hint="Minimal 8 karakter.">
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={`${setupInputClass} pr-10`}
            value={values.password}
            onChange={(e) => onChange("password", e.target.value)}
            minLength={8}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </SetupField>

      <SetupField label="Ulangi Password" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          className={setupInputClass}
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          required
        />
      </SetupField>
    </div>
  );
}

import { Building2 } from "lucide-react";
import type { SetupFieldErrors, SetupFormValues } from "@/lib/setup";
import { SetupField, setupInputClass } from "./SetupField";

interface SchoolDetailsStepProps {
  values: SetupFormValues;
  errors: SetupFieldErrors;
  onChange: (field: keyof SetupFormValues, value: string) => void;
}

export function SchoolDetailsStep({ values, errors, onChange }: SchoolDetailsStepProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <Building2 size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Data Sekolah</h2>
          <p className="mt-1 text-sm text-slate-500">Informasi ini akan tampil di kop laporan dan halaman login.</p>
        </div>
      </div>

      <SetupField label="Nama Sekolah" htmlFor="schoolName" error={errors.schoolName}>
        <input
          id="schoolName"
          type="text"
          autoComplete="organization"
          className={setupInputClass}
          placeholder="SMA Negeri 1 Contoh"
          value={values.schoolName}
          onChange={(e) => onChange("schoolName", e.target.value)}
          maxLength={150}
          required
        />
      </SetupField>

      <SetupField
        label="NPSN"
        htmlFor="npsn"
        error={errors.npsn}
        hint="Nomor Pokok Sekolah Nasional, 8 digit angka."
      >
        <input
          id="npsn"
          type="text"
          inputMode="numeric"
          className={setupInputClass}
          placeholder="20100001"
          value={values.npsn}
          onChange={(e) => onChange("npsn", e.target.value.replace(/\D/g, "").slice(0, 8))}
          required
        />
      </SetupField>
    </div>
  );
}

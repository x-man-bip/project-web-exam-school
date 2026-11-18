import { CheckCircle2 } from "lucide-react";
import type { SetupFormValues } from "@/lib/setup";

interface SetupReviewStepProps {
  values: SetupFormValues;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-800 text-right break-all">{value}</dd>
    </div>
  );
}

export function SetupReviewStep({ values }: SetupReviewStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Periksa Kembali</h2>
        <p className="mt-1 text-sm text-slate-500">Pastikan data berikut sudah benar sebelum membuat akun.</p>
      </div>

      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        <ReviewRow label="Nama Sekolah" value={values.schoolName.trim()} />
        <ReviewRow label="NPSN" value={values.npsn.trim()} />
        <ReviewRow label="Kepala Sekolah" value={values.adminName.trim()} />
        <ReviewRow label="NIP / Username" value={values.identifier.trim()} />
        <ReviewRow label="Email" value={values.email.trim()} />
      </dl>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 flex items-start gap-2.5">
        <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <p className="text-xs text-slate-700 leading-relaxed">
          Setelah akun Kepala Sekolah dibuat, halaman pengaturan awal ini <span className="font-semibold">dikunci secara permanen</span> dan
          tidak dapat dibuka kembali.
        </p>
      </div>
    </div>
  );
}

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Building2, ClipboardCheck, LockKeyhole, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { SchoolLogo } from "@/components/SchoolLogo";
import { Spinner } from "@/components/ui";
import { SchoolDetailsStep } from "@/components/setup/SchoolDetailsStep";
import { AdminAccountStep } from "@/components/setup/AdminAccountStep";
import { SetupReviewStep } from "@/components/setup/SetupReviewStep";
import { SetupStepper, type SetupStep } from "@/components/setup/SetupStepper";
import {
  submitInitialSetup,
  validateAdminStep,
  validateSchoolStep,
  type SetupFieldErrors,
  type SetupFormValues,
} from "@/lib/setup";

const STEPS: SetupStep[] = [
  { label: "Sekolah", icon: Building2 },
  { label: "Kepala Sekolah", icon: ShieldCheck },
  { label: "Konfirmasi", icon: ClipboardCheck },
];

const EMPTY_VALUES: SetupFormValues = {
  schoolName: "",
  npsn: "",
  adminName: "",
  identifier: "",
  email: "",
  password: "",
};

type Outcome = "form" | "success" | "locked";

export function SetupWizard({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<SetupFormValues>(EMPTY_VALUES);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<SetupFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("form");

  const handleChange = (field: keyof SetupFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
  };

  const goNext = () => {
    const stepErrors = step === 0
      ? validateSchoolStep(values)
      : validateAdminStep(values, confirmPassword);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setSubmitError(null);
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitInitialSetup(values);
      setOutcome(result.locked ? "locked" : "success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Setup gagal diselesaikan. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (step < STEPS.length - 1) goNext();
    else void handleSubmit();
  };

  if (outcome === "success") {
    return (
      <SetupShell>
        <div className="text-center py-6 animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-full bg-success-100 text-success-600 flex items-center justify-center">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-slate-800">Setup Berhasil</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Akun Kepala Sekolah untuk <span className="font-semibold text-slate-700">{values.schoolName.trim()}</span> telah dibuat.
            Silakan masuk menggunakan email dan password yang baru saja Anda atur.
          </p>
          <button type="button" onClick={onFinish} className="btn-primary mt-8 w-full sm:w-auto">
            Lanjut ke Halaman Login
            <ArrowRight size={18} />
          </button>
        </div>
      </SetupShell>
    );
  }

  if (outcome === "locked") {
    return (
      <SetupShell>
        <div className="text-center py-6 animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
            <LockKeyhole size={30} />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-slate-800">Setup Sudah Dikunci</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Pengaturan awal sudah pernah diselesaikan dan tidak dapat dijalankan lagi.
            Silakan masuk menggunakan akun yang sudah ada.
          </p>
          <button type="button" onClick={onFinish} className="btn-primary mt-8 w-full sm:w-auto">
            Ke Halaman Login
            <ArrowRight size={18} />
          </button>
        </div>
      </SetupShell>
    );
  }

  return (
    <SetupShell>
      <SetupStepper steps={STEPS} current={step} />

      <form onSubmit={handleFormSubmit} noValidate className="mt-8">
        <div key={step} className="animate-fade-in">
          {step === 0 && (
            <SchoolDetailsStep values={values} errors={errors} onChange={handleChange} />
          )}
          {step === 1 && (
            <AdminAccountStep
              values={values}
              confirmPassword={confirmPassword}
              errors={errors}
              onChange={handleChange}
              onConfirmPasswordChange={handleConfirmPasswordChange}
            />
          )}
          {step === 2 && <SetupReviewStep values={values} />}
        </div>

        {submitError && (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 animate-fade-in" role="alert">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || submitting}
            className="btn-secondary w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={18} />
            Kembali
          </button>
          <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed">
            {submitting ? <Spinner size={18} /> : null}
            {step < STEPS.length - 1 ? "Lanjut" : "Buat Akun Kepala Sekolah"}
            {step < STEPS.length - 1 && !submitting && <ArrowRight size={18} />}
          </button>
        </div>
      </form>
    </SetupShell>
  );
}

function SetupShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-8">
          <SchoolLogo portal="admin" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-10">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Setup awal hanya dapat dijalankan satu kali oleh Kepala Sekolah.
        </p>
      </div>
    </div>
  );
}

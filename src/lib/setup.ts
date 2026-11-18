import { supabase } from "./supabase";

export interface SetupFormValues {
  schoolName: string;
  npsn: string;
  adminName: string;
  identifier: string;
  email: string;
  password: string;
}

export type SetupFieldErrors = Partial<Record<keyof SetupFormValues | "confirmPassword", string>>;

export const SETUP_LOCKED_MESSAGE = "Initial setup is permanently locked.";

export async function fetchSetupRequired(): Promise<boolean> {
  const { data, error } = await supabase.rpc("setup_required");
  if (error) throw new Error(error.message);
  if (typeof data !== "boolean") throw new Error("Respons status setup tidak valid.");
  return data;
}

export async function submitInitialSetup(values: SetupFormValues): Promise<{ locked: boolean }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-initialize`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(values),
  });

  if (response.ok) return { locked: false };

  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const message = typeof body?.error === "string" ? body.error : "Setup gagal diselesaikan. Silakan coba lagi.";
  if (response.status === 403) return { locked: true };
  throw new Error(message);
}

export function validateSchoolStep(values: SetupFormValues): SetupFieldErrors {
  const errors: SetupFieldErrors = {};
  if (values.schoolName.trim().length < 3) errors.schoolName = "Nama sekolah minimal 3 karakter.";
  if (!/^\d{8}$/.test(values.npsn.trim())) errors.npsn = "NPSN harus terdiri dari 8 digit angka.";
  return errors;
}

export function validateAdminStep(values: SetupFormValues, confirmPassword: string): SetupFieldErrors {
  const errors: SetupFieldErrors = {};
  if (values.adminName.trim().length < 2) errors.adminName = "Nama lengkap minimal 2 karakter.";
  if (values.identifier.trim().length < 3) errors.identifier = "NIP/Username minimal 3 karakter.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Format email tidak valid.";
  if (values.password.length < 8) errors.password = "Password minimal 8 karakter.";
  if (confirmPassword !== values.password) errors.confirmPassword = "Konfirmasi password tidak sama.";
  return errors;
}

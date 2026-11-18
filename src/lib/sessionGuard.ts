import { supabase } from "./supabase";

export const SESSION_REVOKED_KEY = "session_revoked_notice";
export const SESSION_REVOKED_MESSAGE = "Sesi Anda telah berakhir karena akun ini terhubung di perangkat lain.";

export async function enforceSingleSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enforce-single-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
  });
  if (!res.ok) throw new Error("Gagal mengamankan sesi akun.");
}

export async function isSessionRevoked(): Promise<boolean> {
  const { error } = await supabase.auth.getUser();
  return error !== null && (error.status === 401 || error.status === 403);
}

export function markSessionRevoked(): void {
  sessionStorage.setItem(SESSION_REVOKED_KEY, SESSION_REVOKED_MESSAGE);
}

export function consumeSessionRevokedNotice(): string | null {
  const message = sessionStorage.getItem(SESSION_REVOKED_KEY);
  sessionStorage.removeItem(SESSION_REVOKED_KEY);
  return message;
}

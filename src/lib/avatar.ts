import { supabase } from "./supabase";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg"];

export function validateAvatar(file: Blob): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) return "Format foto harus PNG atau JPG.";
  if (file.size > AVATAR_MAX_BYTES) return "Ukuran foto maksimal 2 MB.";
  return null;
}

async function callChangeAvatar(init: { method: "POST" | "DELETE"; body?: FormData }): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesi tidak valid. Silakan login kembali.");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-avatar`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
    body: init.body,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error ?? "Gagal memproses foto profil.");
  }
  return typeof payload.avatar_url === "string" ? payload.avatar_url : null;
}

export async function uploadAvatar(file: Blob): Promise<string | null> {
  const problem = validateAvatar(file);
  if (problem) throw new Error(problem);
  const form = new FormData();
  form.append("file", file, "avatar");
  return callChangeAvatar({ method: "POST", body: form });
}

export async function removeAvatar(): Promise<void> {
  await callChangeAvatar({ method: "DELETE" });
}

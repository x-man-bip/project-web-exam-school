import { supabase } from "./supabase";

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface EdgeFunctionResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function callEdgeFunction<T = unknown>(
  slug: string,
  body: unknown,
): Promise<EdgeFunctionResult<T>> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    let parsed: T | null = null;
    try { parsed = await res.json() as T; } catch { parsed = null; }
    if (!res.ok) {
      const errMsg = (parsed as { error?: unknown } | null)?.error;
      return { ok: false, status: res.status, data: parsed, error: typeof errMsg === "string" ? errMsg : `Permintaan gagal (${res.status})` };
    }
    return { ok: true, status: res.status, data: parsed, error: null };
  } catch {
    return { ok: false, status: 0, data: null, error: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda." };
  }
}

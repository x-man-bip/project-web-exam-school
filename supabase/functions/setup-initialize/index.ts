import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LOCKED_MESSAGE = "Initial setup is permanently locked.";
const CLAIM_TTL_MS = 5 * 60 * 1000;
const NPSN_PATTERN = /^\d{8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SetupInput {
  schoolName: string;
  npsn: string;
  adminName: string;
  identifier: string;
  email: string;
  password: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseInput(raw: unknown): SetupInput | string {
  if (!raw || typeof raw !== "object") return "Data setup tidak valid.";
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const input: SetupInput = {
    schoolName: str(b.schoolName),
    npsn: str(b.npsn),
    adminName: str(b.adminName),
    identifier: str(b.identifier),
    email: str(b.email).toLowerCase(),
    password: typeof b.password === "string" ? b.password : "",
  };
  if (input.schoolName.length < 3 || input.schoolName.length > 150) {
    return "Nama sekolah harus 3-150 karakter.";
  }
  if (!NPSN_PATTERN.test(input.npsn)) return "NPSN harus terdiri dari 8 digit angka.";
  if (input.adminName.length < 2 || input.adminName.length > 100) {
    return "Nama Kepala Sekolah harus 2-100 karakter.";
  }
  if (input.identifier.length < 3 || input.identifier.length > 50) {
    return "NIP/Username harus 3-50 karakter.";
  }
  if (!EMAIL_PATTERN.test(input.email) || input.email.length > 255) {
    return "Format email tidak valid.";
  }
  if (input.password.length < 8 || input.password.length > 72) {
    return "Password harus 8-72 karakter.";
  }
  return input;
}

async function isLocked(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.rpc("setup_required");
  if (error) throw error;
  return data !== true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let claimed = false;
  let createdUserId: string | null = null;

  const releaseClaim = async () => {
    if (!claimed) return;
    const { error } = await admin
      .from("system_setup")
      .update({ claimed_at: null })
      .eq("id", 1)
      .is("completed_at", null);
    if (error) console.error("Failed to release setup claim", error);
  };

  try {
    if (await isLocked(admin)) {
      return json({ error: LOCKED_MESSAGE }, 403);
    }

    const parsed = parseInput(await req.json().catch(() => null));
    if (typeof parsed === "string") {
      return json({ error: parsed }, 400);
    }

    const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
    const { data: claim, error: claimErr } = await admin
      .from("system_setup")
      .update({ claimed_at: new Date().toISOString() })
      .eq("id", 1)
      .is("completed_at", null)
      .or(`claimed_at.is.null,claimed_at.lt.${staleCutoff}`)
      .select("id")
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claim) {
      return (await isLocked(admin))
        ? json({ error: LOCKED_MESSAGE }, 403)
        : json({ error: "Setup sedang diproses. Silakan coba lagi sebentar." }, 409);
    }
    claimed = true;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.adminName, identifier: parsed.identifier, role: "super_admin" },
    });
    if (createErr || !created.user) {
      await releaseClaim();
      return json({ error: "Email tidak dapat digunakan. Gunakan email lain." }, 400);
    }
    createdUserId = created.user.id;

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ role: "super_admin", full_name: parsed.adminName, identifier: parsed.identifier, is_active: true })
      .eq("id", createdUserId);
    if (profileErr) throw profileErr;

    const { error: schoolErr } = await admin
      .from("school_settings")
      .update({ school_name: parsed.schoolName, npsn: parsed.npsn })
      .eq("id", 1);
    if (schoolErr) throw schoolErr;

    const { error: lockErr } = await admin
      .from("system_setup")
      .update({ completed_at: new Date().toISOString(), claimed_at: null })
      .eq("id", 1);
    if (lockErr) throw lockErr;

    return json({ success: true }, 201);
  } catch (err) {
    console.error("Initial setup failed", err);
    if (createdUserId) {
      const { error } = await admin.auth.admin.deleteUser(createdUserId);
      if (error) console.error("Failed to roll back setup user", error);
    }
    await releaseClaim();
    return json({ error: "Setup gagal diselesaikan. Silakan coba lagi." }, 500);
  }
});

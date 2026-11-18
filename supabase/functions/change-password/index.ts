import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: caller, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: activeAttempt, error: attemptErr } = await adminClient
      .from("exam_attempts")
      .select("id")
      .eq("student_id", caller.user.id)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    if (activeAttempt) {
      return json({ error: "Password tidak dapat diubah selama ujian berlangsung" }, 403);
    }

    const body = await req.json();
    const { current_password, new_password } = body ?? {};

    if (!current_password || !new_password) {
      return json({ error: "Password saat ini dan password baru wajib diisi" }, 400);
    }
    if (typeof new_password !== "string" || new_password.length < 8) {
      return json({ error: "Password baru minimal 8 karakter" }, 400);
    }

    const verifyClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: caller.user.email ?? "",
      password: current_password,
    });
    if (signInErr || !signInData.session) {
      return json({ error: "Password saat ini tidak sesuai" }, 403);
    }

    const { error: updateErr } = await userClient.auth.updateUser({
      password: new_password,
    });
    if (updateErr) {
      return json({ error: updateErr.message }, 400);
    }

    // Password change ends every other session for this account, including the verification session above.
    const { error: revokeErr } = await adminClient.auth.admin.signOut(accessToken, "others");
    if (revokeErr) throw revokeErr;

    return json({ success: true, message: "Password berhasil diubah" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

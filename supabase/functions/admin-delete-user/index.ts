import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check: caller must send their own JWT (verify_jwt=true guarantees this).
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: caller, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is a super_admin
    const adminClient = createClient(url, serviceKey);
    const { data: profile, error: pErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (pErr || !profile || profile.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion and deletion of other super_admins
    const body = await req.json();
    const user_ids: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids
      : body?.user_id
        ? [body.user_id]
        : [];
    if (user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "No user ids provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (user_ids.includes(caller.user.id)) {
      return new Response(JSON.stringify({ error: "Tidak dapat menghapus akun sendiri" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch targets to guard against deleting super_admin accounts
    const { data: targets, error: tErr } = await adminClient
      .from("profiles")
      .select("id, role")
      .in("id", user_ids);
    if (tErr) {
      return new Response(JSON.stringify({ error: tErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const protectedIds = (targets ?? []).filter((t) => t.role === "super_admin").map((t) => t.id);
    if (protectedIds.length > 0) {
      return new Response(
        JSON.stringify({ error: "Akun Kepala Sekolah tidak dapat dihapus", protected: protectedIds }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const safeIds = (targets ?? []).map((t) => t.id);
    if (safeIds.length === 0) {
      return new Response(JSON.stringify({ error: "User tidak ditemukan" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let succeeded = 0;
    let failed = 0;
    const details: { id: string; success: boolean; error?: string }[] = [];
    for (const id of safeIds) {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(id);
      if (delErr) {
        failed++;
        details.push({ id, success: false, error: delErr.message });
      } else {
        succeeded++;
        details.push({ id, success: true });
      }
    }

    return new Response(
      JSON.stringify({ succeeded, failed, total: safeIds.length, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

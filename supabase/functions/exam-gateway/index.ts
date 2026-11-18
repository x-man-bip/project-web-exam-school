import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getClientIp(req: Request): string | null {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = req.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("X-Real-IP");
  if (realIp) return realIp.trim();
  return null;
}

function isIpAllowed(clientIp: string, allowlist: string): boolean {
  const lines = allowlist.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;

  const toLong = (ip: string): number | null => {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let result = 0;
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (isNaN(n) || n < 0 || n > 255) return null;
      result = (result << 8) + n;
    }
    return result >>> 0;
  };

  const clientLong = toLong(clientIp);
  if (clientLong === null) return false;

  for (const entry of lines) {
    const [ipPart, cidrPart] = entry.split("/");
    const ipLong = toLong(ipPart);
    if (ipLong === null) continue;
    const prefix = cidrPart ? parseInt(cidrPart, 10) : 32;
    if (prefix === 0) return true;
    if (prefix < 0 || prefix > 32) continue;
    const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
    if ((clientLong & mask) === (ipLong & mask)) return true;
  }
  return false;
}

interface SchoolSecuritySettings {
  ip_allowlist: string;
  require_seb: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: caller, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(url, serviceKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "student") {
      return new Response(
        JSON.stringify({ error: "Hanya siswa yang dapat mengakses ujian melalui gateway ini." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: settings } = await adminClient
      .from("school_settings")
      .select("ip_allowlist, require_seb")
      .eq("id", 1)
      .maybeSingle();
    const sec: SchoolSecuritySettings = {
      ip_allowlist: (settings as SchoolSecuritySettings | null)?.ip_allowlist ?? "",
      require_seb: (settings as SchoolSecuritySettings | null)?.require_seb ?? false,
    };

    const clientIp = getClientIp(req);
    if (sec.ip_allowlist && sec.ip_allowlist.trim() !== "") {
      if (!clientIp || !isIpAllowed(clientIp, sec.ip_allowlist)) {
        return new Response(
          JSON.stringify({
            error: "Akses ujian ditolak: Anda harus berada di jaringan sekolah.",
            client_ip: clientIp,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const body = await req.json();
    const { exam_id, access_token, strict_mode } = body ?? {};
    if (!exam_id) {
      return new Response(JSON.stringify({ error: "exam_id wajib diisi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sebHeader =
      req.headers.get("X-SafeExamBrowser-ConfigHash") ?? req.headers.get("X-SafeExamBrowser");
    const sebVerified = !!sebHeader;
    if (sec.require_seb && strict_mode !== false && !sebVerified) {
      return new Response(
        JSON.stringify({
          error:
            "Ujian ini wajib menggunakan Safe Exam Browser. Silakan buka ujian melalui aplikasi SEB.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: examData, error: examErr } = await userClient.rpc("fetch_student_exam", {
      p_exam_id: exam_id,
      p_access_token: access_token ?? null,
      p_seb_verified: sebVerified,
    });

    if (examErr) {
      return new Response(JSON.stringify({ error: examErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ data: examData, seb_verified: sebVerified, client_ip: clientIp }),
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

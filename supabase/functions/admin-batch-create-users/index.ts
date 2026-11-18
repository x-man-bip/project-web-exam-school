import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RowUser {
  email: string;
  password: string;
  role: string;
  full_name: string;
  identifier?: string;
  class_id?: string;
  class_name?: string;
}

interface ResultItem {
  email: string;
  success: boolean;
  error?: string;
  id?: string;
}

const LEVEL_BY_GRADE: Record<string, string> = {
  "7": "Tingkat 7",
  "8": "Tingkat 8",
  "9": "Tingkat 9",
};

function inferLevel(className: string): string | null {
  const match = className.trim().match(/^(\d)/);
  if (!match) return null;
  return LEVEL_BY_GRADE[match[1]] ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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
      return json({ error: "Unauthorized" }, 401);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: pErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (pErr || !profile || profile.role !== "super_admin") {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const users: RowUser[] = body.users ?? [];
    if (!Array.isArray(users) || users.length === 0) {
      return json({ error: "No users provided" }, 400);
    }
    if (users.length > 200) {
      return json({ error: "Maximum 200 users per batch" }, 400);
    }

    // Cache class-name -> class_id across the batch to avoid repeated lookups
    const classCache = new Map<string, string>();

    async function resolveClassId(rawName: string): Promise<string | null> {
      const name = rawName.trim();
      if (!name) return null;
      const key = name.toLowerCase();
      const cached = classCache.get(key);
      if (cached) return cached;

      const { data: existing } = await adminClient
        .from("classes")
        .select("id, name")
        .ilike("name", name)
        .maybeSingle();

      if (existing) {
        classCache.set(key, existing.id);
        return existing.id;
      }

      const level = inferLevel(name);
      const { data: created, error: createErr } = await adminClient
        .from("classes")
        .insert({ name, level })
        .select("id")
        .single();

      if (createErr || !created) {
        return null;
      }
      classCache.set(key, created.id);
      return created.id;
    }

    const results: ResultItem[] = [];

    for (const u of users) {
      if (!u.email || !u.password || !u.role || !u.full_name) {
        results.push({ email: u.email ?? "(empty)", success: false, error: "Missing required fields" });
        continue;
      }
      if (!["teacher", "student", "super_admin"].includes(u.role)) {
        results.push({ email: u.email, success: false, error: "Invalid role" });
        continue;
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: {
          full_name: u.full_name,
          identifier: u.identifier ?? null,
          role: u.role,
        },
      });

      if (error) {
        results.push({ email: u.email, success: false, error: error.message });
        continue;
      }

      await adminClient
        .from("profiles")
        .update({ role: u.role, full_name: u.full_name, identifier: u.identifier ?? null })
        .eq("id", data.user.id);

      // Enroll student into class — resolve by name or use explicit class_id
      if (u.role === "student") {
        let classId = u.class_id ?? null;
        if (!classId && u.class_name) {
          classId = await resolveClassId(u.class_name);
        }
        if (classId) {
          await adminClient
            .from("class_enrollments")
            .upsert(
              { student_id: data.user.id, class_id: classId },
              { onConflict: "student_id,class_id" },
            );
        }
      }

      results.push({ email: u.email, success: true, id: data.user.id });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    return json({ results, succeeded, failed, total: results.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

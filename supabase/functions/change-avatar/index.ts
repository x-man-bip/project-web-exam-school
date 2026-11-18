import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { Image } from "npm:imagescript@3.20.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const OUTPUT_SIZE = 256;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hasPrefix = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

const SCRIPT_MARKERS = [/<script/i, /<\?php/i, /<%/, /javascript:/i];

function containsEmbeddedScript(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  return SCRIPT_MARKERS.some((pattern) => pattern.test(text));
}

async function requireCaller(url: string, anonKey: string, authHeader: string) {
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function assertNoActiveExam(
  admin: ReturnType<typeof createClient>,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("exam_attempts")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "in_progress")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = await requireCaller(url, anonKey, authHeader);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (await assertNoActiveExam(admin, caller.id)) {
      return json({ error: "Foto profil tidak dapat diubah selama ujian berlangsung" }, 403);
    }

    const path = `${caller.id}`;

    if (req.method === "DELETE") {
      const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(path);
      if (listErr) throw listErr;
      if (files && files.length > 0) {
        const { error: removeErr } = await admin.storage
          .from(BUCKET)
          .remove(files.map((f) => `${path}/${f.name}`));
        if (removeErr) throw removeErr;
      }
      const { error: clearErr } = await admin.from("profiles").update({ avatar_url: null }).eq("id", caller.id);
      if (clearErr) throw clearErr;
      return json({ success: true, avatar_url: null });
    }

    const form = await req.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return json({ error: "Berkas foto wajib dikirim" }, 400);
    }
    if (upload.name.includes("\0")) {
      return json({ error: "Nama berkas tidak valid" }, 400);
    }
    if (upload.size === 0 || upload.size > MAX_BYTES) {
      return json({ error: "Ukuran foto maksimal 2 MB" }, 400);
    }
    if (upload.type !== "image/jpeg" && upload.type !== "image/png") {
      return json({ error: "Format foto harus JPG atau PNG" }, 400);
    }

    const raw = new Uint8Array(await upload.arrayBuffer());
    const detected = detectImageType(raw);
    if (!detected || detected !== upload.type) {
      return json({ error: "Isi berkas tidak sesuai dengan format gambar yang diizinkan" }, 400);
    }
    if (containsEmbeddedScript(raw)) {
      return json({ error: "Berkas ditolak karena mengandung konten tidak valid" }, 400);
    }

    let decoded: Image;
    try {
      decoded = (await Image.decode(raw)) as Image;
    } catch {
      return json({ error: "Gambar tidak dapat dibaca. Pilih foto lain." }, 400);
    }

    const side = Math.min(decoded.width, decoded.height);
    const square = decoded.crop(
      Math.floor((decoded.width - side) / 2),
      Math.floor((decoded.height - side) / 2),
      side,
      side,
    );
    square.resize(OUTPUT_SIZE, OUTPUT_SIZE);
    const clean = await square.encodeJPEG(90);

    const objectPath = `${path}/avatar.jpg`;
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(objectPath, clean, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploadErr) throw uploadErr;

    const publicUrl = admin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: profileErr } = await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", caller.id);
    if (profileErr) throw profileErr;

    return json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

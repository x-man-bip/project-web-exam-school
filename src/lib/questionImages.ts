import { supabase } from "@/lib/supabase";

export const QUESTION_IMAGE_BUCKET = "question-images";
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const QUESTION_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function validateQuestionImage(file: Blob): string | null {
  if (!QUESTION_IMAGE_MIME_TYPES.includes(file.type)) return "Format gambar harus PNG, JPG, WEBP, atau GIF.";
  if (file.size > QUESTION_IMAGE_MAX_BYTES) return "Ukuran gambar maksimal 5 MB.";
  return null;
}

export async function uploadQuestionImage(file: Blob, ownerId: string): Promise<string> {
  const problem = validateQuestionImage(file);
  if (problem) throw new Error(problem);
  const ext = EXTENSION_BY_MIME[file.type];
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(QUESTION_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Gambar gagal diunggah. Coba lagi.");
  return supabase.storage.from(QUESTION_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

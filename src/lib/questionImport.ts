import * as XLSX from "xlsx";
import { isHttpUrl } from "@/lib/questionImages";
import { targetToPayload } from "@/lib/questionTarget";
import { type ClassRoom, type QuestionOption, type QuestionType, type Subject } from "@/lib/types";

const OPTION_LETTERS = ["a", "b", "c", "d", "e"];

export const IMPORT_TEMPLATE_HEADERS = [
  "Soal", "Tipe", "Poin", "Mapel", "Kelas",
  "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E", "Kunci",
  "url_gambar_soal", "url_gambar_opsi_a", "url_gambar_opsi_b", "url_gambar_opsi_c", "url_gambar_opsi_d", "url_gambar_opsi_e",
];

const TEMPLATE_EXAMPLE = [
  "Ibukota Indonesia adalah...", "PG", 1, "Matematika", "X IPA 1",
  "Jakarta", "Bandung", "Surabaya", "Medan", "", "A",
  "https://example.com/peta.png", "", "", "", "", "",
];

export function downloadImportTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([IMPORT_TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Soal");
  XLSX.writeFile(book, "template-import-soal.xlsx");
}

/** Keys are lowercase, trimmed column headers. `images` holds only valid http(s) image URLs keyed like `url_gambar_soal`. */
export interface ImportRow {
  values: Record<string, string>;
  images: Record<string, string>;
}

export function readExcelRows(buffer: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json.map((raw) => {
    const row: ImportRow = { values: {}, images: {} };
    for (const [header, cell] of Object.entries(raw)) {
      const key = header.trim().toLowerCase();
      const value = String(cell ?? "").trim();
      row.values[key] = value;
      if (key.startsWith("url_gambar_") && value && isHttpUrl(value)) row.images[key] = value;
    }
    return row;
  });
}

export interface ImportDefaults {
  subjects: Subject[];
  classes: ClassRoom[];
  defaultSubjectId: string;
  defaultTarget: string;
}

export interface ParsedQuestion {
  subject_id: string;
  class_id: string | null;
  class_level: string | null;
  type: QuestionType;
  content: string;
  image_url: string | null;
  options: QuestionOption[];
  correct_answer: unknown;
  points: number;
}

export function parseImportRow(row: ImportRow, defaults: ImportDefaults): ParsedQuestion | null {
  const get = (keys: string[]) => {
    for (const k of keys) if (k in row.values) return row.values[k];
    return "";
  };
  const image = (key: string) => row.images[key] ?? null;

  const content = get(["soal", "pertanyaan", "content", "question"]);
  if (!content) return null;

  const typeRaw = get(["tipe", "type"]).toLowerCase();
  const points = Number(get(["poin", "points"])) || 1;
  const subjectName = get(["mapel", "mata pelajaran", "subject"]) || (defaults.subjects.find((s) => s.id === defaults.defaultSubjectId)?.name ?? "");
  const targetName = get(["kelas", "target", "class"]) || defaults.defaultTarget;

  const type: QuestionType = typeRaw.includes("kompleks") ? "pg_kompleks" : typeRaw.includes("centang") || typeRaw.includes("mcma") ? "mcma" : typeRaw.includes("uraian") ? "uraian" : "pg";
  const subject = defaults.subjects.find((s) => s.name.toLowerCase() === subjectName.toLowerCase()) ?? defaults.subjects.find((s) => s.id === defaults.defaultSubjectId);
  if (!subject) return null;

  let classId: string | null = null;
  let classLevel: string | null = null;
  const cls = defaults.classes.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
  if (cls) classId = cls.id;
  else if (targetName) classLevel = targetName;
  else {
    const tv = targetToPayload(defaults.defaultTarget);
    classId = tv.class_id ?? null;
    classLevel = tv.class_level ?? null;
  }

  let options: QuestionOption[] = [];
  if (type === "pg" || type === "mcma") {
    const letters = OPTION_LETTERS.map((l, i) => ({
      text: get([`opsi ${l}`, l]),
      image_url: image(`url_gambar_opsi_${l}`),
      index: i,
    }));
    const lastFilled = letters.reduce((last, o) => (o.text || o.image_url ? o.index : last), -1);
    options = letters.slice(0, lastFilled + 1).map(({ text, image_url }) => ({ text, image_url }));
  } else if (type === "pg_kompleks") {
    options = [1, 2, 3].map((n) => ({ text: get([`pernyataan ${n}`]), image_url: null }));
  }

  const correctRaw = get(["kunci", "correct", "jawaban benar"]).toLowerCase();
  let correctAnswer: unknown = null;
  if (type === "pg") {
    const idx = OPTION_LETTERS.indexOf(correctRaw);
    correctAnswer = idx >= 0 ? idx : null;
  } else if (type === "uraian") {
    correctAnswer = correctRaw;
  }

  return {
    subject_id: subject.id,
    class_id: classId,
    class_level: classLevel,
    type,
    content,
    image_url: image("url_gambar_soal"),
    options,
    correct_answer: correctAnswer,
    points,
  };
}

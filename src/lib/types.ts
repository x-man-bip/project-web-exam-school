export type Role = "super_admin" | "teacher" | "student";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  identifier: string | null;
  avatar_url: string | null;
  created_at: string;
  is_active: boolean;
}

export type SubjectCategory = "wajib" | "pilihan" | "muatan_lokal";

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: SubjectCategory;
  created_at: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  level: string | null;
  created_at: string;
}

export interface AcademicYear {
  id: string;
  year_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Semester {
  id: string;
  semester_name: string;
  is_active: boolean;
  created_at: string;
}

export interface ClassPeriod {
  id: string;
  class_id: string;
  academic_year_id: string;
  semester_id: string;
  homeroom_teacher_id: string | null;
  created_at: string;
  class?: ClassRoom;
  academic_year?: AcademicYear;
  semester?: Semester;
  homeroom_teacher?: Profile;
}

export interface ClassEnrollment {
  id: string;
  class_id: string;
  class_period_id: string | null;
  student_id: string;
  created_at: string;
  student?: Profile;
  class?: ClassRoom;
  class_period?: ClassPeriod;
}

export interface TeacherAssignment {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  class_period_id: string | null;
  created_at: string;
  teacher?: Profile;
  subject?: Subject;
  class?: ClassRoom;
  class_period?: ClassPeriod;
}

export interface HomeroomAssignment {
  id: string;
  class_id: string;
  teacher_id: string;
  academic_year: string;
  created_at: string;
  teacher?: Profile;
  class?: ClassRoom;
}

export type QuestionType = "pg" | "pg_kompleks" | "mcma" | "uraian";
export interface QuestionOption {
  text: string;
  image_url: string | null;
  /** Original index of this option in the question's stored options array. */
  oi?: number;
}

export function normalizeOption(raw: unknown): QuestionOption {
  if (typeof raw === "string") return { text: raw, image_url: null };
  if (raw && typeof raw === "object") {
    const o = raw as { text?: unknown; image_url?: unknown; oi?: unknown };
    return {
      text: typeof o.text === "string" ? o.text : "",
      image_url: typeof o.image_url === "string" && o.image_url ? o.image_url : null,
      oi: typeof o.oi === "number" ? o.oi : undefined,
    };
  }
  return { text: "", image_url: null };
}

export type QuestionVerificationStatus = "draft" | "pending_review" | "approved";

export const QUESTION_STATUS_LABELS: Record<QuestionVerificationStatus, string> = {
  draft: "Draft",
  pending_review: "Menunggu Review",
  approved: "Disetujui",
};

export interface Question {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string | null;
  class_level: string | null;
  type: QuestionType;
  content: string;
  image_url: string | null;
  options: any[];
  correct_answer: any;
  points: number;
  verification_status: QuestionVerificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  subject?: Subject;
  class?: ClassRoom;
  teacher?: { full_name: string } | null;
  reviewer?: { full_name: string } | null;
}

export type ExamApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export const EXAM_APPROVAL_LABELS: Record<ExamApprovalStatus, string> = {
  draft: "Draft",
  pending: "Menunggu Persetujuan KS",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export interface Exam {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string | null;
  class_level: string | null;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  strict_mode: boolean;
  status: "draft" | "published" | "active";
  max_tab_switches: number;
  semester: string;
  academic_year: string;
  acak_soal: boolean;
  acak_opsi: boolean;
  shuffle_mode: "all" | "per_subject";
  approval_status: ExamApprovalStatus;
  approval_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  subject?: Subject;
  class?: ClassRoom;
  teacher?: { full_name: string } | null;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  points: number;
  question_order: number;
  question?: Question;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  status: "not_started" | "in_progress" | "submitted" | "auto_submitted";
  start_time: string;
  submit_time: string | null;
  tab_switches: number;
  auto_score: number;
  essay_score: number | null;
  final_score: number | null;
  max_score: number;
  created_at: string;
  exam?: Exam;
  student?: Profile;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: any;
  is_correct: boolean | null;
  score: number;
  graded: boolean;
  graded_by: string | null;
  graded_at: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
  question?: Question;
}

export interface AuditLog {
  id: string;
  attempt_id: string | null;
  student_id: string | null;
  event_type: string;
  details: any;
  created_at: string;
  student?: Profile;
}

// Student-facing exam payload (NO correct_answer field)
export interface StudentExamRow {
  out_exam_id: string;
  out_exam_title: string;
  out_exam_description: string | null;
  out_duration_minutes: number;
  out_strict_mode: boolean;
  out_start_time: string | null;
  out_max_tab_switches: number;
  out_attempt_id: string;
  out_question_id: string;
  out_question_order: number;
  out_question_type: QuestionType;
  out_question_content: string;
  out_question_options: any[];
  out_points: number;
  out_question_image_url: string | null;
  out_session_token: string | null;
  out_seb_verified: boolean;
  out_acak_soal: boolean;
  out_acak_opsi: boolean;
  out_shuffle_mode: string;
}

export interface StudentExamData {
  exam: {
    id: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    strict_mode: boolean;
    start_time: string | null;
    max_tab_switches: number;
    acak_soal: boolean;
    acak_opsi: boolean;
    shuffle_mode: "all" | "per_subject";
  };
  attemptId: string;
  sessionToken: string | null;
  questions: {
    id: string;
    order: number;
    type: QuestionType;
    content: string;
    imageUrl: string | null;
    options: QuestionOption[];
    points: number;
  }[];
}

export function parseStudentExam(rows: StudentExamRow[]): StudentExamData | null {
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    exam: {
      id: r.out_exam_id,
      title: r.out_exam_title,
      description: r.out_exam_description,
      duration_minutes: r.out_duration_minutes,
      strict_mode: r.out_strict_mode,
      start_time: r.out_start_time,
      max_tab_switches: r.out_max_tab_switches,
      acak_soal: (r as { out_acak_soal?: boolean }).out_acak_soal ?? true,
      acak_opsi: (r as { out_acak_opsi?: boolean }).out_acak_opsi ?? true,
      shuffle_mode: ((r as { out_shuffle_mode?: string }).out_shuffle_mode === "per_subject" ? "per_subject" : "all") as "all" | "per_subject",
    },
    attemptId: r.out_attempt_id,
    sessionToken: r.out_session_token ?? null,
    questions: rows
      .map((row) => ({
        id: row.out_question_id,
        order: row.out_question_order,
        type: row.out_question_type as QuestionType,
        content: row.out_question_content,
        options: (row.out_question_options ?? []).map(normalizeOption),
        imageUrl: row.out_question_image_url ?? null,
        points: Number(row.out_points),
      }))
      .sort((a, b) => a.order - b.order),
  };
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  pg: "Pilihan Ganda",
  pg_kompleks: "PG Kompleks",
  mcma: "Centang Benar Banyak",
  uraian: "Uraian",
};

export interface ExamParticipant {
  r_student_id: string;
  r_full_name: string;
  r_identifier: string | null;
  r_class_name: string | null;
  r_class_id: string | null;
}

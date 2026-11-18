import { supabase } from "./supabase";
import type { Subject } from "./types";

/**
 * Fetches subjects assigned to a teacher for the ACTIVE academic year + semester,
 * joined through teacher_assignments and class_periods.
 */
export async function fetchTeacherSubjects(teacherId: string): Promise<Subject[]> {
  const { data: activeYear } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  const { data: activeSem } = await supabase
    .from("semesters")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  const activeYearId = activeYear?.id;
  const activeSemesterId = activeSem?.id;

  let data;
  let error;
  if (activeYearId && activeSemesterId) {
    const result = await supabase
      .from("teacher_assignments")
      .select("subject:subjects(*), class_period:class_periods!inner(academic_year_id, semester_id)")
      .eq("teacher_id", teacherId)
      .eq("class_period.academic_year_id", activeYearId)
      .eq("class_period.semester_id", activeSemesterId);
    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .from("teacher_assignments")
      .select("subject:subjects(*)")
      .eq("teacher_id", teacherId);
    data = result.data;
    error = result.error;
  }
  if (error || !data) {
    // Fallback without period filter
    const { data: fallback } = await supabase
      .from("teacher_assignments")
      .select("subject:subjects(*)")
      .eq("teacher_id", teacherId);
    if (!fallback) return [];
    return dedupSubjects(
      (fallback as unknown as { subject: Subject | Subject[] | null }[])
        .map((r) => (Array.isArray(r.subject) ? r.subject[0] : r.subject))
        .filter((s): s is Subject => s != null),
    );
  }

  return dedupSubjects(
    (data as unknown as { subject: Subject | Subject[] | null }[])
      .map((r) => (Array.isArray(r.subject) ? r.subject[0] : r.subject))
      .filter((s): s is Subject => s != null),
  );
}

function dedupSubjects(subjects: Subject[]): Subject[] {
  const seen = new Set<string>();
  return subjects.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

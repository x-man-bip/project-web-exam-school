import { supabase } from "./supabase";
import type { ClassRoom } from "./types";

/**
 * Fetches classes assigned to a teacher for the ACTIVE academic year + semester,
 * joined through class_periods and teacher_assignments.
 */
export async function fetchTeacherClasses(teacherId: string): Promise<ClassRoom[]> {
  // First get active academic_year_id and semester_id
  const { data: activeData } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  const { data: activeSem } = await supabase
    .from("semesters")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  const activeYearId = activeData?.id;
  const activeSemesterId = activeSem?.id;

  if (!activeYearId || !activeSemesterId) {
    // Fallback: fetch all classes via teacher_assignments without period filter
    const { data, error } = await supabase
      .from("teacher_assignments")
      .select("class:classes(*)")
      .eq("teacher_id", teacherId);
    if (error || !data) return [];
    const classes = (data as unknown as { class: ClassRoom | ClassRoom[] | null }[])
      .map((r) => (Array.isArray(r.class) ? r.class[0] : r.class))
      .filter((c): c is ClassRoom => c != null);
    return dedupClasses(classes);
  }

  // Fetch via teacher_assignments joined to class_periods for the active period
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select(`
      class:classes(*),
      class_period:class_periods!inner(academic_year_id, semester_id)
    `)
    .eq("teacher_id", teacherId)
    .eq("class_period.academic_year_id", activeYearId)
    .eq("class_period.semester_id", activeSemesterId);

  if (error || !data) {
    // Fallback: try without period filter
    const { data: fallback } = await supabase
      .from("teacher_assignments")
      .select("class:classes(*)")
      .eq("teacher_id", teacherId);
    if (!fallback) return [];
    const classes = (fallback as unknown as { class: ClassRoom | ClassRoom[] | null }[])
      .map((r) => (Array.isArray(r.class) ? r.class[0] : r.class))
      .filter((c): c is ClassRoom => c != null);
    return dedupClasses(classes);
  }

  const classes = (data as unknown as { class: ClassRoom | ClassRoom[] | null }[])
    .map((r) => (Array.isArray(r.class) ? r.class[0] : r.class))
    .filter((c): c is ClassRoom => c != null);

  return dedupClasses(classes);
}

function dedupClasses(classes: ClassRoom[]): ClassRoom[] {
  const seen = new Set<string>();
  return classes.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

export function groupClassesByLevel(classes: ClassRoom[]) {
  const byLevel: Record<string, ClassRoom[]> = {};
  for (const c of classes) {
    const level = c.level ?? "Lainnya";
    (byLevel[level] ??= []).push(c);
  }
  return byLevel;
}

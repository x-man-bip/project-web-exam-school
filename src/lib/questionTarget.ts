import type { ClassRoom, Question } from "@/lib/types";

export interface TargetOption {
  value: string;
  label: string;
}

export interface TargetGroup {
  label: string;
  options: TargetOption[];
}

export function targetKeyForQuestion(q: Pick<Question, "class_id" | "class_level">): string {
  return q.class_id ? `class:${q.class_id}` : `level:${q.class_level}`;
}

export function targetLabelForQuestion(q: Pick<Question, "class" | "class_level">): string {
  return q.class ? q.class.name : `Semua kelas ${q.class_level}`;
}

export function buildTargetGroups(classes: ClassRoom[]): TargetGroup[] {
  const levels = Array.from(
    new Set(classes.map((c) => c.level).filter((l): l is string => !!l))
  ).sort();

  const groups: TargetGroup[] = [];
  if (levels.length > 0) {
    groups.push({
      label: "Semua kelas (sesuai tingkat)",
      options: levels.map((level) => ({
        value: `level:${level}`,
        label: `Semua kelas ${level}`,
      })),
    });
  }
  groups.push({
    label: "Kelas tertentu",
    options: classes.map((c) => ({ value: `class:${c.id}`, label: c.name })),
  });
  return groups;
}

export function targetToPayload(value: string): { class_id: string | null; class_level: string | null } {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  return kind === "level"
    ? { class_id: null, class_level: id }
    : { class_id: id, class_level: null };
}

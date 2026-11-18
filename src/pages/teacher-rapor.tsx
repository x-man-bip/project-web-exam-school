import { useCallback, useEffect, useState } from "react";
import { ScrollText, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useSchoolSettings } from "@/lib/schoolSettings";
import type { ClassRoom, Subject } from "@/lib/types";
import { Spinner, EmptyState } from "@/components/ui";
import { GradeRecapReport, SEMESTERS, ACADEMIC_YEARS } from "@/components/GradeRecapReport";

export function TeacherGradeRecap() {
  const { profile } = useAuth();
  const { settings, activeAcademicYear, activeSemester } = useSchoolSettings();
  const activeYear = settings?.academic_year ?? "2026/2027";
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semester, setSemester] = useState<string>(activeSemester?.semester_name ?? "Ganjil");
  const [academicYear, setAcademicYear] = useState<string>(activeYear);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    // Fetch homeroom classes via class_periods for the active year + semester
    let homeroomQuery = supabase
      .from("class_periods")
      .select(`
        class:classes(*),
        academic_year:academic_years(year_name),
        semester:semesters(semester_name)
      `)
      .eq("homeroom_teacher_id", profile.id);

    if (activeAcademicYear?.id) {
      homeroomQuery = homeroomQuery.eq("academic_year_id", activeAcademicYear.id);
    }
    if (activeSemester?.id) {
      homeroomQuery = homeroomQuery.eq("semester_id", activeSemester.id);
    }

    const [homeroomRes, subjectRes] = await Promise.all([
      homeroomQuery,
      supabase.from("subjects").select("*").order("name"),
    ]);

    if (homeroomRes.error || subjectRes.error) {
      setError("Data rapor belum bisa dimuat. Silakan coba lagi.");
      setLoading(false);
      return;
    }

    const homeroomClasses = ((homeroomRes.data ?? []) as unknown as { class: ClassRoom | ClassRoom[] | null }[])
      .map((h) => (Array.isArray(h.class) ? h.class[0] : h.class))
      .filter((c): c is ClassRoom => c != null)
      .sort((a, b) => a.name.localeCompare(b.name, "id"));

    setClasses(homeroomClasses);
    setSubjects((subjectRes.data ?? []) as Subject[]);
    setSelectedId(homeroomClasses[0]?.id ?? "");
    setLoading(false);
  }, [profile, activeAcademicYear, activeSemester]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rapor Kelas</h1>
          <p className="text-slate-500 mt-1">Rekap nilai seluruh mata pelajaran untuk kelas yang Anda ampu sebagai wali kelas.</p>
        </div>
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rapor Kelas</h1>
          <p className="text-slate-500 mt-1">Rekap nilai seluruh mata pelajaran untuk kelas yang Anda ampu sebagai wali kelas.</p>
        </div>
        <div className="card p-12 text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-error-50 flex items-center justify-center mb-4">
            <ScrollText size={36} className="text-error-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Gagal memuat</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">{error}</p>
          <button onClick={retry} className="btn-primary">
            <RefreshCw size={18} /> Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const selectedClass = classes.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Rapor Kelas</h1>
        <p className="text-slate-500 mt-1">Rekap nilai seluruh mata pelajaran untuk kelas yang Anda ampu sebagai wali kelas.</p>
      </div>

      {classes.length === 0 || !selectedClass ? (
        <EmptyState
          icon={<ScrollText size={28} />}
          title="Belum ada kelas perwalian"
          description="Anda belum ditetapkan sebagai wali kelas. Hubungi Kepala Sekolah untuk penugasan."
        />
      ) : (
        <>
          <div className="card p-5 no-print">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label" htmlFor="rapor-class">Kelas</label>
                {classes.length > 1 ? (
                  <select id="rapor-class" className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-semibold text-slate-800 py-2.5">{selectedClass.name}{selectedClass.level ? ` (${selectedClass.level})` : ""}</p>
                )}
              </div>
              <div>
                <label className="label">Semester</label>
                <select className="input" value={semester} onChange={(e) => setSemester(e.target.value)}>
                  {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tahun Ajaran</label>
                <select className="input" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                  {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <GradeRecapReport
            key={`${selectedClass.id}-${semester}-${academicYear}`}
            classRoom={selectedClass}
            subjects={subjects}
            semester={semester}
            academicYear={academicYear}
          />
        </>
      )}
    </div>
  );
}

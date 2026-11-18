import { useEffect, useMemo, useState } from "react";
import {
  Printer, ScrollText, TrendingUp, Award, CheckCircle, XCircle,
  Search, FileSpreadsheet, AlertCircle, Users, RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings } from "@/lib/schoolSettings";
import type { ClassRoom, Subject, Profile } from "@/lib/types";
import { Badge, Spinner, EmptyState } from "@/components/ui";
import { TABLE_SCROLL_CLASS, TablePagination, usePagination } from "@/components/DataTable";

const PASSING_THRESHOLD = 70;

export const SEMESTERS = ["Ganjil", "Genap"] as const;
export const ACADEMIC_YEARS = ["2026/2027", "2027/2028", "2028/2029"] as const;

interface Cell {
  final_score: number | null;
  status: string;
}

interface StudentRow {
  student: Profile;
  scores: Record<string, Cell | null>;
  total: number | null;
  average: number | null;
  passed: boolean;
}

interface GradeRecapReportProps {
  classRoom: ClassRoom;
  subjects: Subject[];
  semester: string;
  academicYear: string;
}

export function GradeRecapReport({ classRoom, subjects, semester, academicYear }: GradeRecapReportProps) {
  const { settings } = useSchoolSettings();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt] = useState(new Date());
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const [enrollRes, recapRes] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("student:profiles!student_id(id, full_name, identifier), class_period_id")
          .eq("class_id", classRoom.id),
        supabase.rpc("get_class_grade_recap", {
          p_class_id: classRoom.id,
          p_semester: semester,
          p_academic_year: academicYear,
        }),
      ]);
      if (cancelled) return;

      if (enrollRes.error || recapRes.error) {
        setError("Rekap nilai belum bisa dimuat. Silakan coba lagi.");
        setLoading(false);
        return;
      }

      const students = ((enrollRes.data ?? []) as unknown as { student: Profile | Profile[] | null }[])
        .map((e) => (Array.isArray(e.student) ? e.student[0] : e.student))
        .filter((s): s is Profile => s != null)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));

      const bestByStudentSubject: Record<string, Record<string, number>> = {};
      for (const row of (recapRes.data ?? []) as { r_student_id: string; r_subject_id: string; r_best_score: number | string }[]) {
        if (!bestByStudentSubject[row.r_student_id]) bestByStudentSubject[row.r_student_id] = {};
        bestByStudentSubject[row.r_student_id][row.r_subject_id] = Number(row.r_best_score);
      }

      const result: StudentRow[] = students.map((student) => {
        const scores: Record<string, Cell | null> = {};
        let sum = 0;
        let count = 0;
        for (const sub of subjects) {
          const score = bestByStudentSubject[student.id]?.[sub.id] ?? null;
          scores[sub.id] = score != null ? { final_score: score, status: "submitted" } : null;
          if (score != null) { sum += score; count++; }
        }
        const average = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
        return { student, scores, total: count > 0 ? sum : null, average, passed: (average ?? 0) >= PASSING_THRESHOLD };
      });

      setRows(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [classRoom.id, subjects, semester, academicYear, reloadKey]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.student.full_name.toLowerCase().includes(q) ||
        (r.student.identifier ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const { paged: pagedRows, page, setPage, pageSize, setPageSize, total, totalPages, start, end } = usePagination(filteredRows);

  useEffect(() => { setPage(0); }, [search, setPage]);

  const schoolName = settings?.school_name ?? "Sekolah";
  const schoolLogo = settings?.logo_url;

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const data = filteredRows.map((row, i) => {
      const entry: Record<string, string | number> = {
        No: i + 1,
        NISN: row.student.identifier ?? "-",
        "Nama Siswa": row.student.full_name,
      };
      for (const sub of subjects) {
        entry[sub.name] = row.scores[sub.id]?.final_score ?? "-";
      }
      entry["Total"] = row.total ?? "-";
      entry["Rata-rata"] = row.average ?? "-";
      entry["Status"] = row.average == null ? "Belum ada nilai" : row.passed ? "Lulus" : "Remedial";
      return entry;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Rapor ${classRoom.name}`);
    XLSX.writeFile(wb, `Rapor_${classRoom.name}_${semester}_${academicYear.replace("/", "-")}.xlsx`);
  };

  const canExport = !loading && !error && rows.length > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonToolbar />
        <div className="card p-6">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
            <Spinner size={16} /> Memuat data nilai...
          </div>
          <SkeletonTable subjectCount={Math.min(subjects.length, 6)} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 text-center">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-error-50 flex items-center justify-center mb-4">
          <AlertCircle size={36} className="text-error-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Gagal memuat</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">{error}</p>
        <button onClick={() => setReloadKey((k) => k + 1)} className="btn-primary">
          <RefreshCw size={18} /> Coba Lagi
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} />}
        title={`Belum ada siswa di ${classRoom.name}`}
        description={`Kelas ${classRoom.name} belum memiliki siswa terdaftar.`}
      />
    );
  }

  const hasAnyScore = rows.some((r) => Object.values(r.scores).some((c) => c?.final_score != null));

  if (!hasAnyScore) {
    return (
      <EmptyState
        icon={<ScrollText size={28} />}
        title={`Belum ada data nilai untuk ${classRoom.name}`}
        description={`Data nilai untuk Kelas ${classRoom.name} belum diisi oleh guru mapel untuk ${semester} tahun ajaran ${academicYear}.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar — hidden in print */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print sticky top-[60px] z-20 bg-slate-50 py-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Cari nama atau NISN siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} disabled={!canExport} className="btn-secondary">
            <FileSpreadsheet size={18} /> Export Excel
          </button>
          <button onClick={handlePrint} disabled={!canExport} className="btn-primary">
            <Printer size={18} /> Cetak Rapor (PDF)
          </button>
        </div>
      </div>

      <div id="print-area" className="card p-6 lg:p-8 print-area">
        <div className="print-header">
          {schoolLogo && <img src={schoolLogo} alt="Logo" className="print-logo" />}
          <div className="print-header-text">
            <h2 className="text-lg font-bold text-slate-800">{schoolName}</h2>
            <p className="text-sm text-slate-500">RAPOR / REKAP NILAI</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <p><span className="text-slate-400">Kelas:</span> <span className="font-semibold text-slate-700">{classRoom.name}</span></p>
            <p><span className="text-slate-400">Tingkat:</span> <span className="font-semibold text-slate-700">{classRoom.level ?? "-"}</span></p>
          </div>
          <div className="text-right">
            <p><span className="text-slate-400">Tahun Ajaran:</span> <span className="font-semibold text-slate-700">{academicYear}</span></p>
            <p><span className="text-slate-400">Semester:</span> <span className="font-semibold text-slate-700">{semester}</span></p>
            <p><span className="text-slate-400">Tanggal:</span> <span className="font-semibold text-slate-700">{generatedAt.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</span></p>
          </div>
        </div>

        <div className={TABLE_SCROLL_CLASS}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold border border-slate-200 no-print-col">No</th>
                <th className="px-3 py-2.5 text-left font-semibold border border-slate-200 min-w-[120px]">NISN</th>
                <th className="px-3 py-2.5 text-left font-semibold border border-slate-200 min-w-[180px]">Nama Siswa</th>
                {subjects.map((sub) => (
                  <th key={sub.id} className="px-3 py-2.5 text-center font-semibold border border-slate-200 whitespace-nowrap">
                    {sub.name.length > 12 ? sub.name.slice(0, 10) + "…" : sub.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-semibold border border-slate-200 bg-accent-50">Total</th>
                <th className="px-3 py-2.5 text-center font-semibold border border-slate-200 bg-brand-50">Rata-rata</th>
                <th className="px-3 py-2.5 text-center font-semibold border border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, i) => (
                <tr key={row.student.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-center text-slate-400 border border-slate-200 no-print-col">{start + i + 1}</td>
                  <td className="px-3 py-2 text-slate-600 border border-slate-200">{row.student.identifier ?? "-"}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 border border-slate-200">{row.student.full_name}</td>
                  {subjects.map((sub) => {
                    const cell = row.scores[sub.id];
                    return (
                      <td key={sub.id} className="px-3 py-2 text-center border border-slate-200">
                        {cell?.final_score != null ? (
                          <span className={cell.final_score < PASSING_THRESHOLD ? "text-error-600 font-semibold" : "text-slate-700"}>
                            {cell.final_score}
                          </span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center border border-slate-200 bg-accent-50/50 font-semibold text-slate-700">
                    {row.total ?? <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-center border border-slate-200 bg-brand-50/50">
                    {row.average != null ? (
                      <span className="font-bold text-brand-700">{row.average}</span>
                    ) : <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-center border border-slate-200">
                    {row.average == null ? (
                      <span className="text-slate-400 text-xs">Belum ada nilai</span>
                    ) : row.passed ? (
                      <Badge color="success"><CheckCircle size={12} /> Lulus</Badge>
                    ) : (
                      <Badge color="error"><XCircle size={12} /> Remedial</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-slate-100 font-semibold">
                <td className="px-3 py-2.5 text-center border border-slate-200 no-print-col"></td>
                <td className="px-3 py-2.5 border border-slate-200" colSpan={2}>
                  <span className="flex items-center gap-1.5"><TrendingUp size={14} className="text-slate-400" /> Rata-rata Kelas</span>
                </td>
                {subjects.map((sub) => {
                  const vals = filteredRows.map((r) => r.scores[sub.id]?.final_score).filter((v): v is number => v != null);
                  const avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
                  return (
                    <td key={sub.id} className="px-3 py-2.5 text-center border border-slate-200 text-slate-700">
                      {avg ?? "-"}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center border border-slate-200 bg-accent-100">
                  {(() => {
                    const allTotals = filteredRows.map((r) => r.total).filter((v): v is number => v != null);
                    return allTotals.length > 0 ? Math.round(allTotals.reduce((a, b) => a + b, 0) / allTotals.length * 10) / 10 : "-";
                  })()}
                </td>
                <td className="px-3 py-2.5 text-center border border-slate-200 bg-brand-100">
                  {(() => {
                    const allAvgs = filteredRows.map((r) => r.average).filter((v): v is number => v != null);
                    return allAvgs.length > 0 ? Math.round((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 10) / 10 : "-";
                  })()}
                </td>
                <td className="px-3 py-2.5 text-center border border-slate-200">
                  {(() => {
                    const passedCount = filteredRows.filter((r) => r.average != null && r.passed).length;
                    const totalGraded = filteredRows.filter((r) => r.average != null).length;
                    return totalGraded > 0 ? `${passedCount}/${totalGraded}` : "-";
                  })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 no-print">
          <TablePagination
            total={total}
            page={page}
            totalPages={totalPages}
            start={start}
            end={end}
            pageSize={pageSize}
            noun="siswa"
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 text-sm print-signatures">
          <div className="text-center">
            <p className="text-slate-500">Wali Kelas</p>
            <div className="h-20"></div>
            <p className="font-semibold text-slate-700 border-t border-slate-300 pt-1 inline-block px-8">(________________)</p>
          </div>
          <div className="text-center">
            <p className="text-slate-500">Kepala Sekolah</p>
            <div className="h-20"></div>
            <p className="font-semibold text-slate-700 border-t border-slate-300 pt-1 inline-block px-8">(________________)</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 print-footer">
          <Award size={12} /> Dicetak dari Sistem Ujian Sekolah - {generatedAt.toLocaleString("id-ID")}
        </div>
      </div>
    </div>
  );
}

function SkeletonToolbar() {
  return (
    <div className="flex items-center justify-between gap-3 no-print">
      <div className="h-10 w-64 rounded-lg bg-slate-100 animate-pulse" />
      <div className="flex gap-2">
        <div className="h-10 w-32 rounded-lg bg-slate-100 animate-pulse" />
        <div className="h-10 w-36 rounded-lg bg-slate-100 animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonTable({ subjectCount }: { subjectCount: number }) {
  const cols = 3 + subjectCount + 3; // No + NISN + Name + subjects + Total + Avg + Status
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-2.5 border border-slate-200">
                <div className="h-4 rounded bg-slate-200 animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-3 py-2 border border-slate-200">
                  <div className="h-4 rounded bg-slate-100 animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

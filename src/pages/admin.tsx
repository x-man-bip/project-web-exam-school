import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Users, GraduationCap, School, BookOpen, ClipboardList, Shield,
  ScrollText, Plus, Pencil, Trash2, Search, UserPlus, X,
  Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle,
  Key, FileText, BookOpenCheck,
  Eye, Layers, MessageSquare, ChevronLeft, ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import {
  type Profile, type ClassRoom, type Subject, type SubjectCategory,
  type TeacherAssignment,
  type HomeroomAssignment, type ClassEnrollment, type AuditLog,
  type ClassPeriod, type AcademicYear, type Semester,
  type Role, type Question, type QuestionVerificationStatus,
  QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS,
} from "@/lib/types";
import { StatCard, Badge, Spinner, EmptyState } from "@/components/ui";
import { TABLE_SCROLL_CLASS, TablePagination, usePagination } from "@/components/DataTable";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { GradeRecapReport, SEMESTERS, ACADEMIC_YEARS } from "@/components/GradeRecapReport";
import { QuestionReviewModal } from "@/components/QuestionReviewModal";
import { LiveExamMonitor } from "@/components/dashboard/LiveExamMonitor";
import { TodayExamSchedule } from "@/components/dashboard/TodayExamSchedule";
import { ActivityLogCard } from "@/components/dashboard/ActivityLogCard";
import { QuickActionsCard } from "@/components/dashboard/QuickActionsCard";
import { useSchoolSettings, normalizeAcademicYear } from "@/lib/schoolSettings";
import { targetLabelForQuestion } from "@/lib/questionTarget";
import { Calendar, UsersRound } from "lucide-react";

/* ============================
   Admin Dashboard
   ============================ */
export function AdminDashboard() {
  const { settings, activeAcademicYear, activeSemester } = useSchoolSettings();
  const [stats, setStats] = useState({
    teachers: 0, students: 0, classes: 0, subjects: 0, exams: 0, attempts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, s, c, sub, ex, att] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        teachers: t.count ?? 0, students: s.count ?? 0, classes: c.count ?? 0,
        subjects: sub.count ?? 0, exams: ex.count ?? 0, attempts: att.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={32} /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Kepala Sekolah</h1>
          <p className="text-sm text-slate-500 mt-1">Ringkasan sistem ujian sekolah</p>
        </div>
        {(activeAcademicYear || settings?.academic_year) && (
          <Badge color="brand">
            Tahun Ajaran {activeAcademicYear?.year_name ?? settings?.academic_year}
            {activeSemester ? ` (${activeSemester.semester_name})` : ""}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Guru" value={stats.teachers} icon={<Users size={22} />} color="brand" />
        <StatCard label="Total Siswa" value={stats.students} icon={<GraduationCap size={22} />} color="accent" />
        <StatCard label="Total Kelas" value={stats.classes} icon={<School size={22} />} color="success" />
        <StatCard label="Mata Pelajaran" value={stats.subjects} icon={<BookOpen size={22} />} color="warning" />
        <StatCard label="Total Ujian" value={stats.exams} icon={<ClipboardList size={22} />} color="brand" />
        <StatCard label="Total Percobaan" value={stats.attempts} icon={<ScrollText size={22} />} color="error" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <LiveExamMonitor />
        </div>
        <TodayExamSchedule />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <QuickActionsCard />
        <div className="xl:col-span-2">
          <ActivityLogCard />
        </div>
      </div>
    </div>
  );
}

/* ============================
   User Management
   ============================ */
type RoleFilter = "all" | "super_admin" | "teacher" | "student";
type StatusFilter = "all" | "active" | "inactive";

export function AdminUsers({ initialModal = null }: { initialModal?: "create" | "import" | null }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(initialModal === "create");
  const [showImport, setShowImport] = useState(initialModal === "import");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const callDeleteUsers = async (userIds: string[]): Promise<{ succeeded: number; failed: number; error: string | null }> => {
    const result = await callEdgeFunction<{ succeeded: number; failed: number }>("admin-delete-user", { user_ids: userIds });
    if (!result.ok || !result.data) throw new Error(result.error ?? "Gagal menghapus user");
    return { succeeded: result.data.succeeded ?? 0, failed: result.data.failed ?? 0, error: null };
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c, s, e, ta] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("classes").select("*").order("name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("class_enrollments").select("*, class:classes(*)").order("created_at", { ascending: false }),
      supabase.from("teacher_assignments").select("*, subject:subjects(*)").order("created_at", { ascending: false }),
    ]);
    setUsers(p.data as Profile[] ?? []);
    setClasses(c.data as ClassRoom[] ?? []);
    setSubjects(s.data as Subject[] ?? []);
    setEnrollments(e.data as ClassEnrollment[] ?? []);
    setTeacherAssignments(ta.data as TeacherAssignment[] ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const studentClassMap: Record<string, string> = {};
  for (const en of enrollments) {
    const cls = en.class as unknown as ClassRoom | null;
    if (en.student_id && cls) studentClassMap[en.student_id] = cls.name;
  }
  const teacherSubjectMap: Record<string, string[]> = {};
  for (const ta of teacherAssignments) {
    const sub = ta.subject as unknown as Subject | null;
    if (ta.teacher_id && sub) {
      const names = (teacherSubjectMap[ta.teacher_id] ??= []);
      if (!names.includes(sub.name)) names.push(sub.name);
    }
  }

  const getDetail = (u: Profile): string => {
    if (u.role === "student") return studentClassMap[u.id] ?? "-";
    if (u.role === "teacher") {
      const subs = teacherSubjectMap[u.id];
      return subs && subs.length > 0 ? subs.slice(0, 3).join(", ") + (subs.length > 3 ? ` +${subs.length - 3}` : "") : "-";
    }
    return "Administrator";
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "inactive" && u.is_active) return false;
    if (classFilter) {
      if (u.role !== "student") return false;
      if (studentClassMap[u.id] !== classes.find((c) => c.id === classFilter)?.name) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      if (!u.full_name.toLowerCase().includes(s) &&
          !(u.identifier ?? "").toLowerCase().includes(s) &&
          !u.id.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages, start, end } = usePagination(filtered);

  const pageIds = paged.map((u) => u.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) { pageIds.forEach((id) => next.delete(id)); }
      else { pageIds.forEach((id) => next.add(id)); }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const roleBadge = (role: Role) => {
    const map = {
      super_admin: { label: "Kepala Sekolah", color: "brand" as const },
      teacher: { label: "Guru", color: "accent" as const },
      student: { label: "Siswa", color: "success" as const },
    };
    return <Badge color={map[role].color}>{map[role].label}</Badge>;
  };

  const isProtected = (u: Profile) => u.role === "super_admin";

  const handleExport = () => {
    const rows = filtered.map((u) => ({
      Nama: u.full_name,
      "NIP/NIS": u.identifier ?? "",
      Peran: u.role === "super_admin" ? "Kepala Sekolah" : u.role === "teacher" ? "Guru" : "Siswa",
      "Kelas/Detail": getDetail(u),
      Status: u.is_active ? "Aktif" : "Nonaktif",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "data_user_sekolah.xlsx");
  };

  const handleBulkActivate = async (activate: boolean) => {
    setBulkMsg(null);
    const ids = [...selectedIds];
    const results = await Promise.all(ids.map((id) =>
      supabase.rpc("admin_update_user", { p_user_id: id, p_is_active: activate }),
    ));
    const failedCount = results.filter((r) => r.error).length;
    if (failedCount > 0) { setBulkMsg(`${failedCount} user gagal diperbarui.`); return; }
    setBulkMsg(`${ids.length} user berhasil ${activate ? "diaktifkan" : "dinonaktifkan"}.`);
    setSelectedIds(new Set());
    load();
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    const safe = ids.filter((id) => {
      const u = users.find((x) => x.id === id);
      return u ? !isProtected(u) : false;
    });
    if (safe.length === 0) { setBulkMsg("Tidak ada user yang dapat dihapus (Kepala Sekolah terproteksi)."); return; }
    setDeleteLoading(true);
    setBulkMsg(null);
    try {
      const { succeeded, failed } = await callDeleteUsers(safe);
      setBulkMsg(failed > 0 ? `${succeeded} user berhasil dihapus, ${failed} gagal.` : `${succeeded} user berhasil dihapus.`);
      setSelectedIds(new Set());
      load();
    } catch (e) {
      setBulkMsg(`Gagal: ${e instanceof Error ? e.message : "Terjadi kesalahan"}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetNewPassword || resetNewPassword.length < 6) return;
    setResetLoading(true);
    setResetMsg(null);
    const result = await callEdgeFunction("admin-reset-password", { user_id: resetTarget.id, new_password: resetNewPassword });
    if (!result.ok) {
      setResetMsg({ type: "error", text: result.error ?? "Gagal reset password" });
      setResetLoading(false);
      return;
    }
    setResetMsg({ type: "success", text: `Password ${resetTarget.full_name} berhasil direset.` });
    setResetNewPassword("");
    setResetTarget(null);
    setResetLoading(false);
  };

  const handleToggleStatus = async (u: Profile) => {
    if (isProtected(u)) return;
    await supabase.rpc("admin_update_user", { p_user_id: u.id, p_is_active: !u.is_active });
    load();
  };

  useEffect(() => { setPage(0); }, [search, roleFilter, classFilter, statusFilter, pageSize, setPage]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Manajemen User</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola akun guru dan siswa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Upload size={18} /> Import Excel
          </button>
          <button onClick={handleExport} disabled={loading || filtered.length === 0} className="btn-secondary">
            <Download size={18} /> Export Data
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <UserPlus size={18} /> Tambah User
          </button>
        </div>
      </div>

      {bulkMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${bulkMsg.includes("Gagal") ? "bg-error-50 border-error-200 text-error-700" : "bg-success-50 border-success-200 text-success-700"}`}>
          {bulkMsg}
        </div>
      )}

      {resetMsg && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${resetMsg.type === "error" ? "bg-error-50 border-error-200 text-error-700" : "bg-success-50 border-success-200 text-success-700"}`}>
          {resetMsg.text}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-brand-800">{selectedIds.size} user dipilih</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => handleBulkActivate(true)} className="btn-secondary text-xs px-3 py-1.5">
              <CheckCircle size={14} /> Aktifkan
            </button>
            <button onClick={() => handleBulkActivate(false)} className="btn-secondary text-xs px-3 py-1.5">
              <X size={14} /> Nonaktifkan
            </button>
            <button onClick={handleBulkDelete} className="btn-danger text-xs px-3 py-1.5">
              <Trash2 size={14} /> Hapus
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs px-3 py-1.5">
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="card p-4 sticky top-[60px] z-20">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Cari nama, NIP/NIS, atau ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
            <option value="all">Semua Peran</option>
            <option value="super_admin">Kepala Sekolah</option>
            <option value="teacher">Guru</option>
            <option value="student">Siswa</option>
          </select>
          <select
            className="input w-auto"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            disabled={roleFilter !== "student" && roleFilter !== "all"}
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title="Belum ada user" description="Tambahkan guru atau siswa untuk mulai." />
        ) : (
          <>
            <div className={TABLE_SCROLL_CLASS}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-3 pr-2 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </th>
                    <th className="pb-3 font-medium">Nama</th>
                    <th className="pb-3 font-medium">NIP/NIS</th>
                    <th className="pb-3 font-medium">Peran</th>
                    <th className="pb-3 font-medium">Kelas / Detail</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map((u) => (
                    <tr key={u.id} className={`hover:bg-slate-50/50 transition ${selectedIds.has(u.id) ? "bg-brand-50/40" : ""}`}>
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-slate-800">{u.full_name}</p>
                        <p className="text-xs text-slate-400">{u.id.slice(0, 8)}...</p>
                      </td>
                      <td className="py-3 text-slate-600">{u.identifier ?? "-"}</td>
                      <td className="py-3">{roleBadge(u.role)}</td>
                      <td className="py-3 text-slate-600 max-w-[180px] truncate" title={getDetail(u)}>{getDetail(u)}</td>
                      <td className="py-3">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={isProtected(u)}
                          title={isProtected(u) ? "Akun admin terproteksi" : "Klik untuk ubah status"}
                          className="cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Badge color={u.is_active ? "success" : "error"}>
                            {u.is_active ? <CheckCircle size={12} /> : <X size={12} />}
                            {u.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setResetTarget(u)}
                            className="p-2 rounded-lg text-slate-400 hover:bg-warning-50 hover:text-warning-600 transition"
                            title="Reset Password"
                          >
                            <Key size={16} />
                          </button>
                          <button onClick={() => setEditing(u)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition" title="Edit">
                            <Pencil size={16} />
                          </button>
                          {isProtected(u) ? (
                            <span className="p-2 rounded-lg text-slate-300 cursor-not-allowed" title="Kepala Sekolah tidak dapat dihapus">
                              <Shield size={16} />
                            </span>
                          ) : (
                            <button onClick={() => setDeleteTarget(u)} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600 transition" title="Hapus">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="-mx-4 -mb-4">
              <TablePagination
                total={total}
                page={page}
                totalPages={totalPages}
                start={start}
                end={end}
                pageSize={pageSize}
                noun="user"
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => { setShowCreate(false); if (initialModal) navigate("/admin/users"); }}
          onCreated={load}
        />
      )}
      {showImport && (
        <ImportUsersModal
          onClose={() => { setShowImport(false); if (initialModal) navigate("/admin/users"); }}
          onImported={load}
        />
      )}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteLoading(true);
          try {
            await callDeleteUsers([deleteTarget.id]);
            setDeleteTarget(null);
            load();
          } catch (e) {
            setBulkMsg(`Gagal: ${e instanceof Error ? e.message : "Terjadi kesalahan"}`);
          } finally {
            setDeleteLoading(false);
          }
        }}
        title="Hapus User"
        message={`Hapus ${deleteTarget?.full_name}? Akun dan seluruh data terkait akan dihapus permanen.`}
        confirmText="Hapus"
        danger
      />
      <Modal
        open={!!resetTarget}
        onClose={() => { setResetTarget(null); setResetNewPassword(""); setResetMsg(null); }}
        title="Reset Password User"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="text-slate-500">User:</p>
            <p className="font-semibold text-slate-800">{resetTarget?.full_name}</p>
            <p className="text-xs text-slate-400">{resetTarget?.identifier ?? "-"}</p>
          </div>
          <div>
            <label className="label">Password Baru</label>
            <input
              type="password"
              className="input"
              value={resetNewPassword}
              onChange={(e) => setResetNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              minLength={6}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setResetTarget(null); setResetNewPassword(""); }} className="btn-secondary">Batal</button>
            <button onClick={handleResetPassword} disabled={resetLoading || resetNewPassword.length < 6} className="btn-primary">
              {resetLoading ? <Spinner size={16} /> : <Key size={16} />} Reset Password
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("classes").select("*").order("name").then(({ data }) => {
      setClasses((data as ClassRoom[]) ?? []);
    });
  }, []);

  const identifierLabel = role === "student" ? "NIS / NISN" : role === "teacher" ? "NIP" : "NIP";
  const identifierPlaceholder = role === "student" ? "Contoh: 2024001" : "Contoh: 198501012010011001";

  const validate = (): string | null => {
    if (!fullName.trim()) return "Nama lengkap wajib diisi.";
    if (!email.trim()) return "Email wajib diisi.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Format email tidak valid.";
    if (password.length < 6) return "Password minimal 6 karakter.";
    if (!identifier.trim()) return `${identifierLabel} wajib diisi.`;
    if (!/^\d+$/.test(identifier.trim())) return `${identifierLabel} harus berupa angka saja.`;
    if (role === "student" && !classId) return "Kelas wajib dipilih untuk siswa.";
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    setError(null);
    const result = await callEdgeFunction("admin-create-user", {
      email: email.trim(),
      password,
      role,
      full_name: fullName.trim(),
      identifier: identifier.trim(),
      class_id: role === "student" ? classId : undefined,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Gagal membuat user");
      return;
    }
    onCreated();
    onClose();
  };

  const canSubmit = !!email && !!password && !!fullName && !!identifier && (role !== "student" || !!classId);

  return (
    <Modal open={true} onClose={onClose} title="Tambah User Baru">
      <div className="space-y-4">
        <div>
          <label className="label">Peran</label>
          <select className="input" value={role} onChange={(e) => { setRole(e.target.value as Role); setClassId(""); setError(null); }}>
            <option value="teacher">Guru</option>
            <option value="student">Siswa</option>
            <option value="super_admin">Kepala Sekolah</option>
          </select>
        </div>
        <div>
          <label className="label">Nama Lengkap</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@sekolah.sch.id" />
        </div>
        <div>
          <label className="label">Password</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" minLength={6} />
        </div>
        <div>
          <label className="label">{identifierLabel}</label>
          <input
            inputMode="numeric"
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ""))}
            placeholder={identifierPlaceholder}
          />
        </div>
        {role === "student" && (
          <div>
            <label className="label">Pilih Kelas <span className="text-error-500">*</span></label>
            <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— Pilih Kelas —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.level ? ` (Tingkat ${c.level})` : ""}</option>
              ))}
            </select>
          </div>
        )}
        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary" disabled={loading}>Batal</button>
          <button onClick={submit} disabled={loading || !canSubmit} className="btn-primary">
            {loading ? <Spinner size={16} /> : <UserPlus size={16} />}
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: Profile; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [identifier, setIdentifier] = useState(user.identifier ?? "");
  const [role, setRole] = useState<Role>(user.role);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await supabase.rpc("admin_update_user", {
      p_user_id: user.id,
      p_full_name: fullName,
      p_identifier: identifier,
      p_role: role,
    });
    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit User">
      <div className="space-y-4">
        <div>
          <label className="label">Nama Lengkap</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">NIP / NIS</label>
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </div>
        <div>
          <label className="label">Peran</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="teacher">Guru</option>
            <option value="student">Siswa</option>
            <option value="super_admin">Kepala Sekolah</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================
   Import Users from Excel
   ============================ */
interface ParsedUserRow {
  nama: string;
  email: string;
  password: string;
  role: string;
  identifier: string;
  className: string;
}

function ImportUsersModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedUserRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ succeeded: number; failed: number; total: number; details: { email: string; success: boolean; error?: string }[] } | null>(null);

  const ROLE_MAP: Record<string, string> = {
    guru: "teacher", teacher: "teacher",
    siswa: "student", student: "student",
    kepala: "super_admin", admin: "super_admin", "kepala sekolah": "super_admin",
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResults(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const rows: ParsedUserRow[] = json.map((r) => {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(r).find((rk) => rk.toLowerCase().trim() === k.toLowerCase());
            if (found) return String(r[found] ?? "").trim();
          }
          return "";
        };
        const roleRaw = get(["peran", "role", "jabatan"]).toLowerCase();
        return {
          nama: get(["nama", "nama lengkap", "full_name", "fullname", "name"]),
          email: get(["email", "surel"]),
          password: get(["password", "kata sandi", "sandi", "pass"]),
          role: ROLE_MAP[roleRaw] ?? roleRaw,
          identifier: get(["nip", "nis", "identifier", "nomor induk", "id"]),
          className: get(["kelas", "class", "nama kelas"]),
        };
      });
      const invalid = rows.filter((r) => !r.nama || !r.email || !r.password || !r.role);
      if (invalid.length > 0 && rows.length > 0) {
        setError(`${invalid.length} baris memiliki data tidak lengkap atau peran tidak dikenali. Baris yang valid akan ditampilkan.`);
      }
      setParsedRows(rows);
    } catch {
      setError("Gagal membaca file. Pastikan format Excel/CSV benar.");
    }
  };

  const validRows = parsedRows.filter((r) => r.nama && r.email && r.password && r.role);

  const downloadTemplate = () => {
    const tmpl = [
      { Nama: "Budi Santoso", Email: "budi@sekolah.sch.id", Password: "123456", Peran: "guru", NIP: "198501012010011001", Kelas: "" },
      { Nama: "Siti Aminah", Email: "siti@sekolah.sch.id", Password: "123456", Peran: "siswa", NIS: "2024001", Kelas: "7A" },
      { Nama: "Andi Wijaya", Email: "andi@sekolah.sch.id", Password: "123456", Peran: "siswa", NIS: "2024002", Kelas: "8B" },
    ];
    const ws = XLSX.utils.json_to_sheet(tmpl);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "template_import_user.xlsx");
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    const result = await callEdgeFunction<{ succeeded: number; failed: number; total: number; results: { email: string; success: boolean; error?: string }[] }>("admin-batch-create-users", {
      users: validRows.map((r) => ({
        email: r.email, password: r.password, role: r.role,
        full_name: r.nama, identifier: r.identifier || undefined,
        class_name: r.className || undefined,
      })),
    });
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Gagal import");
      return;
    }
    setResults({
      succeeded: result.data.succeeded, failed: result.data.failed, total: result.data.total,
      details: result.data.results,
    });
    if (result.data.succeeded > 0) onImported();
  };

  return (
    <Modal open={true} onClose={onClose} title="Import User dari Excel" size="lg">
      <div className="space-y-5">
        {/* Instructions */}
        <div className="rounded-lg bg-brand-50 border border-brand-100 p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet size={20} className="text-brand-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-brand-800">
              <p className="font-semibold mb-1">Format File Excel</p>
              <p className="text-brand-700">Gunakan kolom: <span className="font-mono font-semibold">Nama, Email, Password, Peran, NIP/NIS, Kelas</span></p>
              <p className="text-brand-700 mt-1">Nilai Peran: <span className="font-semibold">guru</span> atau <span className="font-semibold">siswa</span></p>
              <p className="text-brand-700 mt-1">Kolom <span className="font-semibold">Kelas</span>: isi untuk siswa (mis. 7A, 8B). Kosongkan untuk guru. Kelas akan dibuat otomatis jika belum ada.</p>
              <button onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
                <Download size={14} /> Unduh Template
              </button>
            </div>
          </div>
        </div>

        {/* Upload area */}
        {!results && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition"
            >
              <Upload size={36} className="text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">
                {fileName ? `File: ${fileName}` : "Klik atau drag file Excel ke sini"}
              </p>
              <p className="text-xs text-slate-400 mt-1">Mendukung .xlsx, .xls, .csv</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-warning-50 border border-warning-200 px-4 py-3 text-sm text-warning-800 flex items-start gap-2">
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Preview table */}
            {parsedRows.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Preview ({validRows.length} valid dari {parsedRows.length} baris)</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="px-3 py-2 font-medium">Nama</th>
                        <th className="px-3 py-2 font-medium">Email</th>
                        <th className="px-3 py-2 font-medium">Peran</th>
                        <th className="px-3 py-2 font-medium">NIP/NIS</th>
                        <th className="px-3 py-2 font-medium">Kelas</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((r, i) => {
                        const valid = !!r.nama && !!r.email && !!r.password && !!r.role;
                        return (
                          <tr key={i} className={valid ? "" : "bg-error-50/40"}>
                            <td className="px-3 py-2 text-slate-700">{r.nama || "-"}</td>
                            <td className="px-3 py-2 text-slate-600">{r.email || "-"}</td>
                            <td className="px-3 py-2 text-slate-600">{r.role || "(invalid)"}</td>
                            <td className="px-3 py-2 text-slate-500">{r.identifier || "-"}</td>
                            <td className="px-3 py-2 text-slate-500">{r.className || "-"}</td>
                            <td className="px-3 py-2">
                              {valid
                                ? <span className="inline-flex items-center gap-1 text-success-600"><CheckCircle size={12} /> OK</span>
                                : <span className="inline-flex items-center gap-1 text-error-500"><AlertCircle size={12} /> Tidak lengkap</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validRows.length > 0 && (
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="btn-secondary">Batal</button>
                <button onClick={handleImport} disabled={loading} className="btn-primary">
                  {loading ? <Spinner size={16} /> : <Upload size={16} />}
                  Import {validRows.length} User
                </button>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 rounded-xl bg-slate-50">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-2xl font-bold text-slate-700 mt-1">{results.total}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-success-50">
                <p className="text-xs text-slate-500">Berhasil</p>
                <p className="text-2xl font-bold text-success-600 mt-1">{results.succeeded}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-error-50">
                <p className="text-xs text-slate-500">Gagal</p>
                <p className="text-2xl font-bold text-error-600 mt-1">{results.failed}</p>
              </div>
            </div>
            {results.details.some((d) => !d.success) && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-error-50 border-b border-error-100 text-sm font-semibold text-error-700">Detail Kegagalan</div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {results.details.filter((d) => !d.success).map((d, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-700">{d.email}</td>
                          <td className="px-3 py-2 text-error-600">{d.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary">Selesai</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ============================
   Academics (Classes + Subjects)
   ============================ */
const LEVELS = ["Tingkat 7", "Tingkat 8", "Tingkat 9"];

const SUBJECT_CATEGORIES: { value: SubjectCategory; label: string; color: "brand" | "accent" | "warning" }[] = [
  { value: "wajib", label: "Wajib", color: "brand" },
  { value: "pilihan", label: "Pilihan", color: "accent" },
  { value: "muatan_lokal", label: "Muatan Lokal", color: "warning" },
];

export function AdminAcademics() {
  const { settings, activeAcademicYear, activeSemester } = useSchoolSettings();
  const activeYear = normalizeAcademicYear(settings?.academic_year);
  const [tab, setTab] = useState<"classes" | "subjects">("classes");
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [classPeriods, setClassPeriods] = useState<ClassPeriod[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassRoom | Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: "class" | "subject" } | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [detailClass, setDetailClass] = useState<ClassRoom | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, s, en, cp, ta, t] = await Promise.all([
      supabase.from("classes").select("*").order("name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("class_enrollments").select("*, class:classes(*), student:profiles!student_id(*)"),
      supabase.from("class_periods").select("*, class:classes(*), homeroom_teacher:profiles!homeroom_teacher_id(full_name, id)").eq("academic_year_id", activeAcademicYear?.id ?? "").eq("semester_id", activeSemester?.id ?? ""),
      supabase.from("teacher_assignments").select("*, subject:subjects(*)"),
      supabase.from("profiles").select("*").eq("role", "teacher").order("full_name"),
    ]);
    setClasses(c.data as ClassRoom[] ?? []);
    setSubjects(s.data as Subject[] ?? []);
    setEnrollments(en.data as ClassEnrollment[] ?? []);
    setClassPeriods(cp.data as ClassPeriod[] ?? []);
    setTeacherAssignments(ta.data as TeacherAssignment[] ?? []);
    setTeachers(t.data as Profile[] ?? []);
    setLoading(false);
  }, [activeAcademicYear?.id, activeSemester?.id]);

  useEffect(() => { load(); }, [load]);

  // Compute student count per class
  const classStudentCount: Record<string, number> = {};
  for (const en of enrollments) {
    if (en.class_id) classStudentCount[en.class_id] = (classStudentCount[en.class_id] ?? 0) + 1;
  }

  // Compute homeroom teacher per class (from class_periods for active period)
  const classHomeroom: Record<string, Profile> = {};
  for (const cp of classPeriods) {
    const teacher = cp.homeroom_teacher as unknown as Profile | null;
    if (cp.class_id && teacher) classHomeroom[cp.class_id] = teacher;
  }

  // Compute teacher count per subject
  const subjectTeacherIds: Record<string, Set<string>> = {};
  for (const ta of teacherAssignments) {
    if (!ta.subject_id) continue;
    (subjectTeacherIds[ta.subject_id] ??= new Set<string>()).add(ta.teacher_id);
  }
  const subjectTeacherCount: Record<string, number> = Object.fromEntries(
    Object.entries(subjectTeacherIds).map(([subjectId, ids]) => [subjectId, ids.size]),
  );

  const filteredClasses = classes.filter((c) => {
    if (levelFilter && c.level !== levelFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredSubjects = subjects.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categoryBadge = (cat: SubjectCategory) => {
    const c = SUBJECT_CATEGORIES.find((x) => x.value === cat);
    return c ? <Badge color={c.color}>{c.label}</Badge> : <Badge color="brand">Wajib</Badge>;
  };

  const handleExport = () => {
    if (tab === "classes") {
      const rows = filteredClasses.map((c) => ({
        "Nama Kelas": c.name,
        "Tingkat": c.level ?? "",
        "Jumlah Siswa": classStudentCount[c.id] ?? 0,
        "Wali Kelas": classHomeroom[c.id]?.full_name ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Kelas");
      XLSX.writeFile(wb, "data_kelas.xlsx");
    } else {
      const rows = filteredSubjects.map((s) => ({
        "Kode": s.code,
        "Nama Mapel": s.name,
        "Kategori": SUBJECT_CATEGORIES.find((c) => c.value === s.category)?.label ?? "Wajib",
        "Jumlah Guru": subjectTeacherCount[s.id] ?? 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mapel");
      XLSX.writeFile(wb, "data_mapel.xlsx");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kelas & Mata Pelajaran</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data kelas dan mapel</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExport} disabled={loading} className="btn-secondary">
            <Download size={18} /> Export Data
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Upload size={18} /> Import Data
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
            <Plus size={18} /> Tambah {tab === "classes" ? "Kelas" : "Mapel"}
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => { setTab("classes"); setSearch(""); setLevelFilter(""); }} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === "classes" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
          Kelas
        </button>
        <button onClick={() => { setTab("subjects"); setSearch(""); setLevelFilter(""); }} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === "subjects" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
          Mata Pelajaran
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder={tab === "classes" ? "Cari nama kelas..." : "Cari nama mapel atau kode..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === "classes" && (
          <select className="input w-auto" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Semua Tingkat</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : tab === "classes" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClasses.length === 0 ? (
            <div className="col-span-full"><EmptyState icon={<School size={28} />} title="Belum ada kelas" description="Tambahkan kelas untuk mulai." /></div>
          ) : filteredClasses.map((c) => (
            <div key={c.id} onClick={() => setDetailClass(c)} className="card p-5 group cursor-pointer hover:shadow-cardHover transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <School size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{c.name}</h3>
                    {c.level && <Badge color="brand">{c.level}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={(e) => { e.stopPropagation(); setEditing(c); setShowForm(true); }} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit"><Pencil size={16} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: c.id, type: "class" }); }} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600" title="Hapus"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users size={15} className="text-slate-400" />
                  <span>{classStudentCount[c.id] ?? 0} Siswa</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Shield size={15} className="text-slate-400" />
                  <span>Wali Kelas: {classHomeroom[c.id]?.full_name ?? "Belum ditugaskan"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSubjects.length === 0 ? (
            <div className="col-span-full"><EmptyState icon={<BookOpen size={28} />} title="Belum ada mapel" description="Tambahkan mata pelajaran untuk mulai." /></div>
          ) : filteredSubjects.map((s) => (
            <div key={s.id} className="card p-5 group hover:shadow-cardHover transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{s.code}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => { setEditing(s); setShowForm(true); }} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit"><Pencil size={16} /></button>
                  <button onClick={() => setDeleteTarget({ id: s.id, type: "subject" })} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600" title="Hapus"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <Layers size={15} className="text-slate-400" />
                  {categoryBadge(s.category)}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users size={15} className="text-slate-400" />
                  <span>{subjectTeacherCount[s.id] ?? 0} Guru Pengampu</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AcademicFormModal
          type={tab}
          editing={editing}
          teachers={teachers}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {showImport && (
        <ImportAcademicsModal
          type={tab}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
      {detailClass && (
        <ClassDetailModal
          classRoom={detailClass}
          studentCount={classStudentCount[detailClass.id] ?? 0}
          homeroom={classHomeroom[detailClass.id] ?? null}
          enrollments={enrollments.filter((en) => en.class_id === detailClass.id)}
          onClose={() => setDetailClass(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "class") {
            await supabase.from("classes").delete().eq("id", deleteTarget.id);
          } else {
            await supabase.from("subjects").delete().eq("id", deleteTarget.id);
          }
          setDeleteTarget(null);
          load();
        }}
        title={deleteTarget?.type === "class" ? "Hapus Kelas" : "Hapus Mapel"}
        message="Yakin ingin menghapus? Data terkait juga akan dihapus."
        confirmText="Hapus"
        danger
      />
    </div>
  );
}

function AcademicFormModal({ type, editing, teachers, onClose, onSaved }: {
  type: "classes" | "subjects";
  editing: ClassRoom | Subject | null;
  teachers: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { settings, activeAcademicYear, activeSemester } = useSchoolSettings();
  const activeYear = normalizeAcademicYear(settings?.academic_year);
  const isClass = type === "classes";
  const [name, setName] = useState(editing ? editing.name : "");
  const [level, setLevel] = useState(editing && isClass ? (editing as ClassRoom).level ?? "" : "");
  const [code, setCode] = useState(editing && !isClass ? (editing as Subject).code : "");
  const [category, setCategory] = useState<SubjectCategory>(
    editing && !isClass ? (editing as Subject).category ?? "wajib" : "wajib"
  );
  const [homeroomId, setHomeroomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendlyError = (raw: string): string => {
    if (raw.includes("class_periods_class_id_academic_year_id_semester_id_key")) {
      return "Kelas ini sudah memiliki periode kelas untuk tahun ajaran dan semester ini.";
    }
    if (raw.includes("duplicate key value")) {
      return "Data duplikat. Penugasan dengan kombinasi ini sudah ada.";
    }
    return raw;
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    if (isClass) {
      if (editing) {
        const { error: updErr } = await supabase.from("classes").update({ name, level }).eq("id", editing.id);
        if (updErr) { setError(friendlyError(updErr.message)); setLoading(false); return; }
      } else {
        const { data: newClass, error: insErr } = await supabase.from("classes").insert({ name, level }).select().single();
        if (insErr) { setError(friendlyError(insErr.message)); setLoading(false); return; }
        // Create a class_period for the active academic year + semester
        if (newClass && activeAcademicYear?.id && activeSemester?.id) {
          const { error: cpErr } = await supabase.from("class_periods").insert({
            class_id: newClass.id,
            academic_year_id: activeAcademicYear.id,
            semester_id: activeSemester.id,
            homeroom_teacher_id: homeroomId || null,
          });
          if (cpErr) { setError(friendlyError(cpErr.message)); setLoading(false); return; }
        }
      }
    } else {
      if (editing) {
        const { error: updErr } = await supabase.from("subjects").update({ name, code, category }).eq("id", editing.id);
        if (updErr) { setError(friendlyError(updErr.message)); setLoading(false); return; }
      } else {
        const { error: insErr } = await supabase.from("subjects").insert({ name, code, category });
        if (insErr) { setError(friendlyError(insErr.message)); setLoading(false); return; }
      }
    }
    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={editing ? (isClass ? "Edit Kelas" : "Edit Mapel") : (isClass ? "Tambah Kelas" : "Tambah Mapel")} size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">{isClass ? "Nama Kelas" : "Nama Mapel"}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={isClass ? "contoh: 7A" : "contoh: Matematika"} />
        </div>
        {isClass ? (
          <>
            <div>
              <label className="label">Tingkat</label>
              <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Pilih Tingkat</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {!editing && (
              <div>
                <label className="label">Wali Kelas (opsional)</label>
                <select className="input" value={homeroomId} onChange={(e) => setHomeroomId(e.target.value)}>
                  <option value="">Belum ditugaskan</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="label">Kode Mapel</label>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="contoh: MTK-07" />
            </div>
            <div>
              <label className="label">Kategori</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as SubjectCategory)}>
                {SUBJECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </>
        )}
        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={loading} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading || !name} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ClassDetailModal({ classRoom, studentCount, homeroom, enrollments, onClose }: {
  classRoom: ClassRoom;
  studentCount: number;
  homeroom: Profile | null;
  enrollments: ClassEnrollment[];
  onClose: () => void;
}) {
  return (
    <Modal open={true} onClose={onClose} title={`Detail Kelas ${classRoom.name}`} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg bg-brand-50 p-4">
          <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
            <School size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">{classRoom.name}</h3>
            {classRoom.level && <Badge color="brand">{classRoom.level}</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Users size={14} /> Jumlah Siswa
            </div>
            <p className="text-xl font-bold text-slate-800">{studentCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Shield size={14} /> Wali Kelas
            </div>
            <p className="text-sm font-medium text-slate-800">{homeroom?.full_name ?? "Belum ditugaskan"}</p>
          </div>
        </div>
        {enrollments.length > 0 && (
          <div>
            <label className="label">Daftar Siswa</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {[...enrollments].sort((a, b) => {
                const nameA = (a.student as unknown as Profile | undefined)?.full_name ?? "";
                const nameB = (b.student as unknown as Profile | undefined)?.full_name ?? "";
                return nameA.localeCompare(nameB, "id");
              }).map((en, i) => {
                const student = en.student as unknown as Profile | undefined;
                return (
                  <div key={en.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
                    <span className="font-medium text-slate-700">{student?.full_name ?? "Unknown"}</span>
                    {student?.identifier && <span className="text-xs text-slate-400">({student.identifier})</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
        </div>
      </div>
    </Modal>
  );
}

function ImportAcademicsModal({ type, onClose, onImported }: {
  type: "classes" | "subjects";
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ succeeded: number; failed: number; total: number } | null>(null);
  const isClass = type === "classes";

  const handleFile = async (file: File) => {
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      let succeeded = 0;
      let failed = 0;
      for (const row of json) {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k.toLowerCase());
            if (found) return String(row[found] ?? "").trim();
          }
          return "";
        };
        if (isClass) {
          const name = get(["nama", "nama kelas", "kelas", "name"]);
          const level = get(["tingkat", "level"]);
          if (!name) { failed++; continue; }
          const { error: insErr } = await supabase.from("classes").insert({ name, level: level || null });
          if (insErr) { failed++; } else { succeeded++; }
        } else {
          const name = get(["nama", "nama mapel", "mapel", "name"]);
          const code = get(["kode", "kode mapel", "code"]);
          const catRaw = get(["kategori", "category", "kelompok"]).toLowerCase();
          const category: SubjectCategory = catRaw.includes("pilihan") ? "pilihan" : catRaw.includes("muatan") ? "muatan_lokal" : "wajib";
          if (!name || !code) { failed++; continue; }
          const { error: insErr } = await supabase.from("subjects").insert({ name, code, category });
          if (insErr) { failed++; } else { succeeded++; }
        }
      }
      setResults({ succeeded, failed, total: json.length });
      if (succeeded > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Import Data ${isClass ? "Kelas" : "Mapel"}`} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium mb-1">Format file Excel/CSV:</p>
          {isClass ? (
            <p>Kolom: <span className="font-mono text-xs">Nama, Tingkat</span></p>
          ) : (
            <p>Kolom: <span className="font-mono text-xs">Nama, Kode, Kategori (Wajib/Pilihan/Muatan Lokal)</span></p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="btn-secondary w-full justify-center">
          {loading ? <Spinner size={16} /> : <Upload size={18} />} Pilih File
        </button>
        {error && <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>}
        {results && (
          <div className="rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700">
            Berhasil: {results.succeeded} | Gagal: {results.failed} | Total: {results.total}
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary">Tutup</button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================
   Assignments (Teacher + Homeroom + Enrollment)
   ============================ */
export function AdminAssignments() {
  const { settings, activeAcademicYear, activeSemester } = useSchoolSettings();
  const activeYear = activeAcademicYear?.year_name ?? normalizeAcademicYear(settings?.academic_year);
  const [tab, setTab] = useState<"teacher" | "homeroom" | "enrollment">("teacher");
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tas, setTas] = useState<TeacherAssignment[]>([]);
  const [classPeriods, setClassPeriods] = useState<ClassPeriod[]>([]);
  const [enrolls, setEnrolls] = useState<ClassEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editHomeroom, setEditHomeroom] = useState<ClassPeriod | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id?: string; eq?: Record<string, string>; message?: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Universal search & filter — direset saat pindah tab
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterClass, setFilterClass] = useState("");

  // Multi-select siswa (tab "Siswa di Kelas")
  const [selectedEnrollIds, setSelectedEnrollIds] = useState<Set<string>>(new Set());
  const [bulkTargetClass, setBulkTargetClass] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Paginasi tabel
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setSearch(""); setFilterSubject(""); setFilterLevel(""); setFilterClass("");
    setSelectedEnrollIds(new Set()); setBulkTargetClass(""); setBulkMsg(null);
    setPage(0);
  }, [tab]);

  // Reset ke halaman 1 saat search/filter berubah
  useEffect(() => { setPage(0); }, [search, filterSubject, filterLevel, filterClass, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    // String kosong bukan UUID yang valid: hanya filter periode jika keduanya tersedia,
    // kalau tidak Postgres melempar "invalid input syntax for type uuid: ''".
    const yearId = activeAcademicYear?.id || null;
    const semId = activeSemester?.id || null;
    const [t, s, c, sub, taData, cpData, enData] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "teacher").order("full_name"),
      supabase.from("profiles").select("*").eq("role", "student").order("full_name"),
      supabase.from("classes").select("*").order("name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("teacher_assignments").select("*, teacher:profiles!teacher_id(*), subject:subjects(*), class:classes(*)").order("created_at", { ascending: false }),
      yearId && semId
        ? supabase.from("class_periods").select("*, class:classes(*), homeroom_teacher:profiles!homeroom_teacher_id(*)").eq("academic_year_id", yearId).eq("semester_id", semId).order("created_at", { ascending: false })
        : supabase.from("class_periods").select("*, class:classes(*), homeroom_teacher:profiles!homeroom_teacher_id(*)").order("created_at", { ascending: false }),
      supabase.from("class_enrollments").select("*, student:profiles!student_id(*), class:classes(*)").order("created_at", { ascending: false }),
    ]);
    const errors = [t, s, c, sub, taData, cpData, enData].filter((r) => r.error);
    if (errors.length > 0) {
      console.error("[AdminAssignments] Fetch errors:", errors.map((e) => ({ table: e.error?.message, code: e.error?.code })));
      setFetchError(`Gagal memuat data: ${errors[0].error?.message ?? "Unknown error"}`);
    }
    setTeachers(t.data as Profile[] ?? []);
    setStudents(s.data as Profile[] ?? []);
    setClasses(c.data as ClassRoom[] ?? []);
    setSubjects(sub.data as Subject[] ?? []);
    setTas(taData.data as TeacherAssignment[] ?? []);
    setClassPeriods(cpData.data as ClassPeriod[] ?? []);
    setEnrolls(enData.data as ClassEnrollment[] ?? []);
    setLoading(false);
  }, [activeAcademicYear?.id, activeSemester?.id]);

  useEffect(() => { load(); }, [load]);

  const classById = new Map(classes.map((cl) => [cl.id, cl]));
  const classPeriodByClassId = new Map(classPeriods.map((cp) => [cp.class_id, cp]));
  const levelKeyOf = (cl: ClassRoom | null | undefined) => {
    const m = `${cl?.level ?? ""} ${cl?.name ?? ""}`.match(/[1-9]/);
    return m ? m[0] : "";
  };

  // Tab "Guru Mengajar": gabungkan baris per Guru + Mapel, kelas ditampilkan sebagai chip
  const teacherGroups = useMemo(() => {
    const groups = new Map<string, { teacher: Profile | null; subject: Subject | null; teacher_id: string; subject_id: string; classIds: string[] }>();
    for (const a of tas) {
      const key = `${a.teacher_id}-${a.subject_id}`;
      const g = groups.get(key) ?? {
        teacher: (a.teacher as unknown as Profile | null) ?? null,
        subject: (a.subject as unknown as Subject | null) ?? null,
        teacher_id: a.teacher_id,
        subject_id: a.subject_id,
        classIds: [],
      };
      g.classIds.push(a.class_id);
      groups.set(key, g);
    }
    let rows = [...groups.values()];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        (r.teacher?.full_name ?? "").toLowerCase().includes(q) ||
        (r.subject?.name ?? "").toLowerCase().includes(q) ||
        r.classIds.some((cid) => (classById.get(cid)?.name ?? "").toLowerCase().includes(q))
      );
    }
    if (filterSubject) rows = rows.filter((r) => r.subject?.id === filterSubject);
    if (filterLevel) rows = rows.filter((r) => r.classIds.some((cid) => levelKeyOf(classById.get(cid)) === filterLevel));
    return rows;
  }, [tas, search, filterSubject, filterLevel, classes]);

  // Tab "Wali Kelas"
  const homeroomRows = useMemo(() => {
    let rows = classPeriods.filter((cp) => cp.homeroom_teacher_id);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((cp) => {
        const teacher = cp.homeroom_teacher as unknown as Profile | null;
        const cls = cp.class as unknown as ClassRoom | null;
        return (teacher?.full_name ?? "").toLowerCase().includes(q) || (cls?.name ?? "").toLowerCase().includes(q);
      });
    }
    if (filterLevel) rows = rows.filter((cp) => levelKeyOf(cp.class as unknown as ClassRoom | null) === filterLevel);
    return rows;
  }, [classPeriods, search, filterLevel]);

  // Tab "Siswa di Kelas"
  const enrollRows = useMemo(() => {
    let rows = enrolls;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((en) => {
        const student = en.student as unknown as Profile | null;
        const cls = en.class as unknown as ClassRoom | null;
        return (student?.full_name ?? "").toLowerCase().includes(q) ||
          (student?.identifier ?? "").toLowerCase().includes(q) ||
          (cls?.name ?? "").toLowerCase().includes(q);
      });
    }
    if (filterClass) rows = rows.filter((en) => en.class_id === filterClass);
    return rows;
  }, [enrolls, search, filterClass]);

  const searchPlaceholder = tab === "teacher"
    ? "Cari nama guru, mapel, atau kelas..."
    : tab === "homeroom"
      ? "Cari nama guru atau kelas..."
      : "Cari nama siswa, NISN, atau kelas...";

  // Hitung baris yang dipaginasi per tab
  const pagedRows = useMemo(() => {
    const rows = tab === "teacher" ? teacherGroups : tab === "homeroom" ? homeroomRows : enrollRows;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages - 1);
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, total);
    const paged = rows.slice(start, end);
    return { paged, total, totalPages, currentPage, start, end };
  }, [tab, teacherGroups, homeroomRows, enrollRows, page, pageSize]);

  const itemCountLabel = tab === "teacher"
    ? `${pagedRows.total} kombinasi guru & mapel`
    : tab === "homeroom"
      ? `${pagedRows.total} wali kelas`
      : `${pagedRows.total} siswa${selectedEnrollIds.size > 0 ? `, ${selectedEnrollIds.size} dipilih` : ""}`;

  const allEnrollSelected = enrollRows.length > 0 && enrollRows.every((en) => selectedEnrollIds.has(en.id));
  const toggleEnrollAll = () => {
    setSelectedEnrollIds((prev) => {
      const next = new Set(prev);
      if (allEnrollSelected) enrollRows.forEach((en) => next.delete(en.id));
      else enrollRows.forEach((en) => next.add(en.id));
      return next;
    });
  };
  const toggleEnroll = (id: string) => {
    setSelectedEnrollIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkMove = async () => {
    if (!bulkTargetClass || selectedEnrollIds.size === 0) return;
    setBulkMoving(true);
    setBulkMsg(null);
    let periodId = classPeriodByClassId.get(bulkTargetClass)?.id;
    if (!periodId) {
      if (!activeAcademicYear?.id || !activeSemester?.id) {
        setBulkMsg({ type: "error", text: "Periode akademik aktif belum diset." });
        setBulkMoving(false);
        return;
      }
      const created = await supabase.from("class_periods").insert({
        class_id: bulkTargetClass,
        academic_year_id: activeAcademicYear.id,
        semester_id: activeSemester.id,
      }).select("id").single();
      if (created.error) {
        setBulkMsg({ type: "error", text: created.error.message });
        setBulkMoving(false);
        return;
      }
      periodId = created.data.id;
    }
    let moved = 0, skipped = 0, failed = 0;
    for (const en of enrolls) {
      if (!selectedEnrollIds.has(en.id)) continue;
      if (en.class_id === bulkTargetClass) { skipped++; continue; }
      if (enrolls.some((o) => o.student_id === en.student_id && o.class_id === bulkTargetClass && o.id !== en.id)) { skipped++; continue; }
      const { error } = await supabase.from("class_enrollments").update({ class_id: bulkTargetClass, class_period_id: periodId }).eq("id", en.id);
      if (error) failed++; else moved++;
    }
    if (moved === 0 && failed === 0) {
      setBulkMsg({ type: "success", text: "Tidak ada siswa yang dipindahkan (semua sudah berada di kelas tujuan)." });
    } else if (failed > 0) {
      setBulkMsg({ type: "error", text: `${moved} siswa berhasil dipindahkan, ${failed} gagal.` });
    } else {
      setBulkMsg({ type: "success", text: `${moved} siswa berhasil dipindahkan${skipped ? `, ${skipped} dilewati (sudah di kelas tujuan)` : ""}.` });
    }
    setSelectedEnrollIds(new Set());
    setBulkTargetClass("");
    load();
  };

  const renderPagination = () => (
    <TablePagination
      total={pagedRows.total}
      page={pagedRows.currentPage}
      totalPages={pagedRows.totalPages}
      start={pagedRows.start}
      end={pagedRows.end}
      pageSize={pageSize}
      noun={tab === "teacher" ? "kombinasi" : tab === "homeroom" ? "wali kelas" : "siswa"}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  );

  const { paged } = pagedRows;

  return (
    <div className="animate-fade-in">
      {/* === STICKY HEADER AREA === */}
      <div className="sticky top-0 z-20 bg-slate-50 space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Penugasan Guru</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola penugasan guru mengajar, wali kelas, dan siswa</p>
        </div>

        {fetchError && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{fetchError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-b border-slate-200">
          {[
            { k: "teacher", l: "Guru Mengajar" },
            { k: "homeroom", l: "Wali Kelas" },
            { k: "enrollment", l: "Siswa di Kelas" },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k as typeof tab)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t.k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Universal Search & Filter Bar */}
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="input pl-9 pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label="Bersihkan pencarian">
                  <X size={14} />
                </button>
              )}
            </div>
            {tab === "teacher" && (
              <>
                <select className="input sm:w-52" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                  <option value="">Semua Mapel</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="input sm:w-44" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
                  <option value="">Semua Tingkat</option>
                  {LEVELS.map((l) => <option key={l} value={l.replace("Tingkat ", "")}>{l}</option>)}
                </select>
              </>
            )}
            {tab === "homeroom" && (
              <select className="input sm:w-44" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
                <option value="">Semua Tingkat</option>
                {LEVELS.map((l) => <option key={l} value={l.replace("Tingkat ", "")}>{l}</option>)}
              </select>
            )}
            {tab === "enrollment" && (
              <select className="input sm:w-52" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                <option value="">Semua Kelas</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-500">{itemCountLabel}</p>
          <button onClick={() => setShowForm(true)} className="btn-primary flex-shrink-0">
            <Plus size={18} /> Tambah Penugasan
          </button>
        </div>
      </div>

      {/* === TABLE AREA === */}
      <div className="mt-4">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : tab === "teacher" ? (
          <div className="card overflow-hidden flex flex-col">
            {teacherGroups.length === 0 ? (
              tas.length === 0
                ? <EmptyState icon={<ClipboardList size={28} />} title="Belum ada penugasan" description="Tambahkan penugasan guru mengajar melalui tombol Tambah Penugasan." />
                : <EmptyState icon={<Search size={28} />} title="Tidak ada hasil" description="Tidak ada penugasan yang cocok dengan pencarian atau filter." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="px-4 py-3 font-medium">Guru</th>
                        <th className="px-4 py-3 font-medium">Mapel</th>
                        <th className="px-4 py-3 font-medium">Kelas</th>
                        <th className="px-4 py-3 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {(paged as typeof teacherGroups).map((g) => (
                        <tr key={`${g.teacher_id}-${g.subject_id}`} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800 w-[25%]">{g.teacher?.full_name ?? "-"}</td>
                          <td className="px-4 py-3 text-slate-600 w-[20%]">{g.subject?.name ?? "-"}</td>
                          <td className="px-4 py-3 w-[40%]">
                            <div className="flex flex-wrap gap-1.5">
                              {g.classIds.map((cid) => (
                                <span key={cid} className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-xs font-medium">
                                  {classById.get(cid)?.name ?? "-"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right w-[15%]">
                            <button
                              onClick={() => setDeleteTarget({
                                table: "teacher_assignments",
                                eq: { teacher_id: g.teacher_id, subject_id: g.subject_id },
                                message: `Yakin ingin menghapus SEMUA penugasan ${g.teacher?.full_name ?? "-"} untuk mapel ${g.subject?.name ?? "-"} (semua kelas)?`,
                              })}
                              className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600"
                              title="Hapus Penugasan"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination()}
              </>
            )}
          </div>
        ) : tab === "homeroom" ? (
          <div className="card overflow-hidden flex flex-col">
            {homeroomRows.length === 0 ? (
              classPeriods.filter((cp) => cp.homeroom_teacher_id).length === 0
                ? <EmptyState icon={<School size={28} />} title="Belum ada wali kelas" description={`Belum ada penugasan wali kelas untuk tahun ajaran ${activeYear}${activeSemester ? ` (${activeSemester.semester_name})` : ""}.`} />
                : <EmptyState icon={<Search size={28} />} title="Tidak ada hasil" description="Tidak ada penugasan wali kelas yang cocok dengan pencarian atau filter." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="px-4 py-3 font-medium">Wali Kelas</th>
                        <th className="px-4 py-3 font-medium">Kelas</th>
                        <th className="px-4 py-3 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {(paged as ClassPeriod[]).map((cp) => {
                        const teacher = cp.homeroom_teacher as unknown as Profile | null;
                        const cls = cp.class as unknown as ClassRoom | null;
                        return (
                          <tr key={cp.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-800 w-[50%]">{teacher?.full_name ?? "-"}</td>
                            <td className="px-4 py-3 text-slate-600 w-[30%]">{cls?.name ?? "-"}</td>
                            <td className="px-4 py-3 text-right w-[20%]">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setEditHomeroom(cp)} className="p-2 rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Edit Penugasan"><Pencil size={16} /></button>
                                <button onClick={() => setDeleteTarget({ table: "class_periods", id: cp.id })} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600" title="Hapus Penugasan"><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {renderPagination()}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk move bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="label">Pindahkan siswa terpilih ke kelas</label>
                <select className="input" value={bulkTargetClass} onChange={(e) => setBulkTargetClass(e.target.value)}>
                  <option value="">Pilih kelas tujuan...</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button onClick={handleBulkMove} disabled={bulkMoving || selectedEnrollIds.size === 0 || !bulkTargetClass} className="btn-primary">
                {bulkMoving ? <Spinner size={16} /> : <UserPlus size={18} />}
                Pindahkan ({selectedEnrollIds.size})
              </button>
            </div>
            {bulkMsg && (
              <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${bulkMsg.type === "error" ? "bg-error-50 border-error-200 text-error-700" : "bg-success-50 border-success-200 text-success-700"}`}>
                {bulkMsg.type === "error" ? <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> : <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />}
                <span>{bulkMsg.text}</span>
              </div>
            )}
            <div className="card overflow-hidden flex flex-col">
              {enrollRows.length === 0 ? (
                enrolls.length === 0
                  ? <EmptyState icon={<GraduationCap size={28} />} title="Belum ada siswa terdaftar" description="Tambahkan penugasan siswa ke kelas melalui tombol Tambah Penugasan." />
                  : <EmptyState icon={<Search size={28} />} title="Tidak ada hasil" description="Tidak ada siswa yang cocok dengan pencarian atau filter." />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white z-10 shadow-sm">
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="px-4 py-3 w-10">
                            <input type="checkbox" checked={allEnrollSelected} onChange={toggleEnrollAll} className="w-4 h-4 accent-brand-600" aria-label="Pilih semua" />
                          </th>
                          <th className="px-4 py-3 font-medium">Siswa</th>
                          <th className="px-4 py-3 font-medium">NISN</th>
                          <th className="px-4 py-3 font-medium">Kelas</th>
                          <th className="px-4 py-3 text-right font-medium">Aksi</th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {(paged as ClassEnrollment[]).map((en) => {
                          const student = en.student as unknown as Profile | null;
                          const cls = en.class as unknown as ClassRoom | null;
                          return (
                            <tr key={en.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 w-10">
                                <input type="checkbox" checked={selectedEnrollIds.has(en.id)} onChange={() => toggleEnroll(en.id)} className="w-4 h-4 accent-brand-600" aria-label={`Pilih ${student?.full_name ?? ""}`} />
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-800">{student?.full_name ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-600">{student?.identifier ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-600">{cls?.name ?? "-"}</td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => setDeleteTarget({ table: "class_enrollments", id: en.id })} className="p-2 rounded-lg text-slate-400 hover:bg-error-50 hover:text-error-600" title="Hapus Penugasan"><Trash2 size={16} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {renderPagination()}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <AssignmentFormModal
          tab={tab}
          teachers={teachers}
          students={students}
          classes={classes}
          subjects={subjects}
          classPeriods={classPeriods}
          activeAcademicYearId={activeAcademicYear?.id ?? ""}
          activeSemesterId={activeSemester?.id ?? ""}
          existingTeacherAssignmentKeys={new Set(tas.map((t) => `${t.teacher_id}-${t.subject_id}-${t.class_id}`))}
          existingEnrollmentKeys={new Set(enrolls.map((e) => `${e.student_id}-${e.class_id}`))}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {editHomeroom && (
        <EditHomeroomModal
          classPeriod={editHomeroom}
          teachers={teachers}
          academicYearLabel={activeYear}
          onClose={() => setEditHomeroom(null)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          let query = supabase.from(deleteTarget.table).delete();
          if (deleteTarget.id) query = query.eq("id", deleteTarget.id);
          for (const [col, val] of Object.entries(deleteTarget.eq ?? {})) query = query.eq(col, val);
          await query;
          setDeleteTarget(null);
          load();
        }}
        title="Hapus Penugasan"
        message={deleteTarget?.message ?? "Yakin ingin menghapus penugasan ini?"}
        confirmText="Hapus"
        danger
      />
    </div>
  );
}

function AssignmentFormModal({ tab, teachers, students, classes, subjects, classPeriods, activeAcademicYearId, activeSemesterId, existingTeacherAssignmentKeys, existingEnrollmentKeys, onClose, onSaved }: {
  tab: "teacher" | "homeroom" | "enrollment";
  teachers: Profile[];
  students: Profile[];
  classes: ClassRoom[];
  subjects: Subject[];
  classPeriods: ClassPeriod[];
  activeAcademicYearId: string;
  activeSemesterId: string;
  existingTeacherAssignmentKeys: Set<string>;
  existingEnrollmentKeys: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homeroomClassIds = new Set(classPeriods.filter((cp) => cp.homeroom_teacher_id).map((cp) => cp.class_id));
  const classPeriodByClassId = new Map(classPeriods.map((cp) => [cp.class_id, cp]));

  const resetFields = () => {
    setTeacherId("");
    setStudentId("");
    setClassId("");
    setSubjectId("");
    setSelectedClassIds([]);
    setError(null);
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  const friendlyError = (raw: string): string => {
    if (raw.includes("class_periods_class_id_academic_year_id_semester_id_key")) {
      return "Kelas ini sudah memiliki periode kelas untuk tahun ajaran dan semester ini.";
    }
    if (raw.includes("class_enrollments_class_period_student_key")) {
      return "Siswa ini sudah terdaftar di kelas tersebut untuk periode ini.";
    }
    if (raw.includes("duplicate key value violates unique constraint")) {
      return "Penugasan ini sudah ada. Silakan periksa data yang sudah dibuat sebelumnya.";
    }
    if (raw.includes("duplicate key value")) {
      return "Data duplikat. Penugasan dengan kombinasi ini sudah ada.";
    }
    return raw;
  };

  const validate = (): string | null => {
    if (tab === "teacher") {
      if (!teacherId) return "Pilih guru terlebih dahulu.";
      if (!subjectId) return "Pilih mata pelajaran terlebih dahulu.";
      if (selectedClassIds.length === 0) return "Pilih minimal satu kelas.";
      const dup = selectedClassIds.find((cid) => existingTeacherAssignmentKeys.has(`${teacherId}-${subjectId}-${cid}`));
      if (dup) return `Penugasan guru ini sudah ada untuk mapel dan kelas ${classes.find((c) => c.id === dup)?.name ?? ""}.`;
    } else if (tab === "homeroom") {
      if (!teacherId) return "Pilih wali kelas terlebih dahulu.";
      if (!classId) return "Pilih kelas terlebih dahulu.";
      if (homeroomClassIds.has(classId)) {
        return "Kelas ini sudah memiliki Wali Kelas yang ditugaskan. Silakan pilih kelas lain atau perbarui penugasan yang sudah ada.";
      }
    } else {
      if (!studentId) return "Pilih siswa terlebih dahulu.";
      if (!classId) return "Pilih kelas terlebih dahulu.";
      if (existingEnrollmentKeys.has(`${studentId}-${classId}`)) {
        return "Siswa ini sudah terdaftar di kelas tersebut.";
      }
    }
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    let res;
    if (tab === "teacher") {
      const fresh = selectedClassIds.filter((cid) => !existingTeacherAssignmentKeys.has(`${teacherId}-${subjectId}-${cid}`));
      if (fresh.length === 0) {
        setError("Semua kelas yang dipilih sudah memiliki penugasan ini.");
        setLoading(false);
        return;
      }
      res = await supabase.from("teacher_assignments").insert(fresh.map((cid) => ({
        teacher_id: teacherId, subject_id: subjectId, class_id: cid,
        class_period_id: classPeriodByClassId.get(cid)?.id ?? null,
      })));
    } else if (tab === "homeroom") {
      // Find or create a class_period for this class in the active period, then set homeroom_teacher_id
      const cp = classPeriodByClassId.get(classId);
      if (cp) {
        res = await supabase.from("class_periods").update({ homeroom_teacher_id: teacherId }).eq("id", cp.id);
      } else {
        res = await supabase.from("class_periods").insert({
          class_id: classId,
          academic_year_id: activeAcademicYearId,
          semester_id: activeSemesterId,
          homeroom_teacher_id: teacherId,
        });
      }
    } else {
      if (!activeAcademicYearId || !activeSemesterId) {
        setError("Periode akademik aktif belum diset.");
        setLoading(false);
        return;
      }
      let periodId = classPeriodByClassId.get(classId)?.id;
      if (!periodId) {
        const created = await supabase.from("class_periods").insert({
          class_id: classId,
          academic_year_id: activeAcademicYearId,
          semester_id: activeSemesterId,
        }).select("id").single();
        if (created.error) {
          setError(friendlyError(created.error.message));
          setLoading(false);
          return;
        }
        periodId = created.data.id;
      }
      res = await supabase.from("class_enrollments").insert({
        student_id: studentId, class_id: classId,
        class_period_id: periodId,
      });
    }
    if (res.error) {
      setError(friendlyError(res.error.message));
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
    handleClose();
  };

  const classNameById = (id: string) => classes.find((c) => c.id === id)?.name ?? "";
  const classLevelKey = (cl: ClassRoom) => {
    const m = `${cl.level ?? ""} ${cl.name}`.match(/[1-9]/);
    return m ? m[0] : "";
  };
  const toggleClassSelection = (id: string) =>
    setSelectedClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal open={true} onClose={handleClose} title="Tambah Penugasan" size="sm">
      <div className="space-y-4">
        {tab === "teacher" && (
          <>
            <div>
              <label className="label">Guru</label>
              <select className="input" value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setError(null); }}>
                <option value="">Pilih guru...</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Mata Pelajaran</label>
              <select className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setError(null); }}>
                <option value="">Pilih mapel...</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Kelas (bisa pilih lebih dari satu)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {["7", "8", "9"].map((lv) => (
                  <button key={lv} type="button" onClick={() => setSelectedClassIds(classes.filter((c) => classLevelKey(c) === lv).map((c) => c.id))} className="btn-secondary text-xs px-3 py-1.5">
                    Pilih Semua Kelas {lv}
                  </button>
                ))}
                <button type="button" onClick={() => setSelectedClassIds(classes.map((c) => c.id))} className="btn-secondary text-xs px-3 py-1.5">Pilih Semua Kelas</button>
                <button type="button" onClick={() => setSelectedClassIds([])} className="btn-secondary text-xs px-3 py-1.5">Kosongkan</button>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleClassSelection(c.id)} className="w-4 h-4 accent-brand-600" />
                    <span className="text-slate-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === "homeroom" && (
          <>
            <div>
              <label className="label">Wali Kelas</label>
              <select className="input" value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setError(null); }}>
                <option value="">Pilih guru...</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Kelas</label>
              <select className="input" value={classId} onChange={(e) => { setClassId(e.target.value); setError(null); }}>
                <option value="">Pilih kelas...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id} disabled={homeroomClassIds.has(c.id)}>
                    {c.name}{homeroomClassIds.has(c.id) ? " (sudah ada wali kelas)" : ""}
                  </option>
                ))}
              </select>
              {classId && homeroomClassIds.has(classId) && (
                <p className="mt-1.5 text-xs text-warning-600 flex items-center gap-1">
                  <AlertCircle size={14} /> Kelas {classNameById(classId)} sudah memiliki wali kelas.
                </p>
              )}
            </div>
          </>
        )}
        {tab === "enrollment" && (
          <>
            <div>
              <label className="label">Siswa</label>
              <select className="input" value={studentId} onChange={(e) => { setStudentId(e.target.value); setError(null); }}>
                <option value="">Pilih siswa...</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Kelas</label>
              <select className="input" value={classId} onChange={(e) => { setClassId(e.target.value); setError(null); }}>
                <option value="">Pilih kelas...</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </>
        )}
        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={handleClose} disabled={loading} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditHomeroomModal({ classPeriod, teachers, academicYearLabel, onClose, onSaved }: {
  classPeriod: ClassPeriod;
  teachers: Profile[];
  academicYearLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teacherId, setTeacherId] = useState(classPeriod.homeroom_teacher_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = classPeriod.class as unknown as ClassRoom | null;

  const submit = async () => {
    if (!teacherId) { setError("Pilih wali kelas terlebih dahulu."); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase
      .from("class_periods")
      .update({ homeroom_teacher_id: teacherId })
      .eq("id", classPeriod.id);
    if (err) {
      const raw = err.message;
      if (raw.includes("duplicate key value")) {
        setError("Data duplikat. Penugasan dengan kombinasi ini sudah ada.");
      } else {
        setError(raw);
      }
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Wali Kelas" size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">Kelas</p>
          <p className="font-semibold text-slate-800">{cls?.name ?? "-"}</p>
          <p className="text-slate-400 mt-1">Tahun Ajaran {academicYearLabel}</p>
        </div>
        <div>
          <label className="label">Wali Kelas</label>
          <select className="input" value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setError(null); }}>
            <option value="">Pilih guru...</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={loading} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan Perubahan
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================
   Academic Period Management
   ============================ */
export function AdminPeriods() {
  const { activeAcademicYear, activeSemester, academicYears, semesters, refresh } = useSchoolSettings();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [classPeriods, setClassPeriods] = useState<ClassPeriod[]>([]);
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showYearForm, setShowYearForm] = useState(false);
  const [showBatchEnroll, setShowBatchEnroll] = useState(false);
  const [batchClassPeriod, setBatchClassPeriod] = useState<ClassPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const yearId = activeAcademicYear?.id ?? "";
    const semId = activeSemester?.id ?? "";
    const [c, t, s, cp] = await Promise.all([
      supabase.from("classes").select("*").order("name"),
      supabase.from("profiles").select("*").eq("role", "teacher").order("full_name"),
      supabase.from("profiles").select("*").eq("role", "student").order("full_name"),
      supabase.from("class_periods").select("*, class:classes(*), homeroom_teacher:profiles!homeroom_teacher_id(*)").eq("academic_year_id", yearId).eq("semester_id", semId),
    ]);
    const periods = (cp.data as ClassPeriod[] | null) ?? [];
    const periodIds = periods.map((p) => p.id);
    const en = periodIds.length
      ? await supabase.from("class_enrollments").select("*, student:profiles!student_id(*)").in("class_period_id", periodIds)
      : { data: [] as ClassEnrollment[], error: null };
    setClasses(c.data as ClassRoom[] ?? []);
    setTeachers(t.data as Profile[] ?? []);
    setStudents(s.data as Profile[] ?? []);
    setClassPeriods(periods);
    setEnrollments((en.data as ClassEnrollment[] | null) ?? []);
    setLoading(false);
  }, [activeAcademicYear?.id, activeSemester?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSetActiveYear = async (yearId: string) => {
    setError(null);
    await supabase.from("academic_years").update({ is_active: false }).neq("id", yearId);
    await supabase.from("academic_years").update({ is_active: true }).eq("id", yearId);
    refresh();
    load();
  };

  const handleSetActiveSemester = async (semId: string) => {
    setError(null);
    await supabase.from("semesters").update({ is_active: false }).neq("id", semId);
    await supabase.from("semesters").update({ is_active: true }).eq("id", semId);
    refresh();
    load();
  };

  const handleInitAllClassPeriods = async () => {
    if (!activeAcademicYear?.id || !activeSemester?.id) return;
    setError(null);
    const existingClassIds = new Set(classPeriods.map((cp) => cp.class_id));
    const missing = classes.filter((c) => !existingClassIds.has(c.id));
    if (missing.length === 0) return;
    const { error: insErr } = await supabase.from("class_periods").insert(
      missing.map((c) => ({
        class_id: c.id,
        academic_year_id: activeAcademicYear.id,
        semester_id: activeSemester.id,
      })),
    );
    if (insErr) { setError(insErr.message); return; }
    load();
  };

  const handleHomeroomChange = async (classPeriodId: string, teacherId: string) => {
    setError(null);
    const { error: updErr } = await supabase
      .from("class_periods")
      .update({ homeroom_teacher_id: teacherId || null })
      .eq("id", classPeriodId);
    if (updErr) { setError(updErr.message); return; }
    load();
  };

  const enrolledStudentIdsByPeriod = (cpId: string): Set<string> => {
    return new Set(enrollments.filter((e) => e.class_period_id === cpId).map((e) => e.student_id));
  };

  const periodLabel = activeAcademicYear && activeSemester
    ? `${activeAcademicYear.year_name} (${activeSemester.semester_name})`
    : "Periode belum diset";

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages, start, end } = usePagination(classPeriods);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Manajemen Periode Akademik</h1>
        <p className="text-sm text-slate-500 mt-1">Atur tahun ajaran, semester, dan penugasan kelas per periode</p>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 flex items-start gap-2">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Period Selector */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={20} className="text-brand-600" />
          <h2 className="text-lg font-semibold text-slate-800">Periode Aktif</h2>
          <Badge color="brand">{periodLabel}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tahun Ajaran Aktif</label>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={activeAcademicYear?.id ?? ""}
                onChange={(e) => handleSetActiveYear(e.target.value)}
              >
                <option value="">Pilih tahun ajaran...</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.year_name}{y.is_active ? " (Aktif)" : ""}</option>
                ))}
              </select>
              <button onClick={() => setShowYearForm(true)} className="btn-secondary px-3">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="label">Semester Aktif</label>
            <select
              className="input"
              value={activeSemester?.id ?? ""}
              onChange={(e) => handleSetActiveSemester(e.target.value)}
            >
              <option value="">Pilih semester...</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.semester_name}{s.is_active ? " (Aktif)" : ""}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Class Periods Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <div className="card">
          <div className="sticky top-[60px] z-20 bg-white rounded-t-xl flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">
                Kelas untuk {periodLabel}
              </h2>
            </div>
            <button onClick={handleInitAllClassPeriods} className="btn-secondary text-xs px-3 py-1.5">
              <Plus size={14} /> Inisialisasi Semua Kelas
            </button>
          </div>
          {classPeriods.length === 0 ? (
            <EmptyState
              icon={<School size={28} />}
              title="Belum ada periode kelas"
              description="Klik 'Inisialisasi Semua Kelas' untuk membuat periode kelas dari master kelas yang ada."
            />
          ) : (
            <>
            <div className={`${TABLE_SCROLL_CLASS} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Kelas</th>
                  <th className="px-4 py-3 font-medium">Wali Kelas</th>
                  <th className="px-4 py-3 font-medium">Jumlah Siswa</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((cp) => {
                  const cls = cp.class as unknown as ClassRoom | null;
                  const teacher = cp.homeroom_teacher as unknown as Profile | null;
                  const enrolledCount = enrolledStudentIdsByPeriod(cp.id).size;
                  return (
                    <tr key={cp.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-800">{cls?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <select
                          className="input py-1.5 text-sm"
                          value={cp.homeroom_teacher_id ?? ""}
                          onChange={(e) => handleHomeroomChange(cp.id, e.target.value)}
                        >
                          <option value="">Belum ditugaskan</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Users size={14} className="text-slate-400" />
                          {enrolledCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setBatchClassPeriod(cp)}
                          className="btn-secondary text-xs px-3 py-1.5"
                        >
                          <UserPlus size={14} /> Plot Siswa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <TablePagination
              total={total}
              page={page}
              totalPages={totalPages}
              start={start}
              end={end}
              pageSize={pageSize}
              noun="kelas"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
            </>
          )}
        </div>
      )}

      {showYearForm && (
        <CreateAcademicYearModal
          onClose={() => setShowYearForm(false)}
          onSaved={() => { setShowYearForm(false); refresh(); }}
        />
      )}
      {batchClassPeriod && (
        <BatchEnrollModal
          classPeriod={batchClassPeriod}
          students={students}
          enrolledIds={enrolledStudentIdsByPeriod(batchClassPeriod.id)}
          onClose={() => setBatchClassPeriod(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function CreateAcademicYearModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [yearName, setYearName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!yearName.trim()) { setError("Masukkan tahun ajaran."); return; }
    setLoading(true);
    setError(null);
    const { error: insErr } = await supabase.from("academic_years").insert({ year_name: yearName.trim() });
    if (insErr) {
      setError(insErr.message.includes("duplicate") ? "Tahun ajaran ini sudah ada." : insErr.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Tambah Tahun Ajaran" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Nama Tahun Ajaran</label>
          <input className="input" value={yearName} onChange={(e) => setYearName(e.target.value)} placeholder="contoh: 2027/2028" />
        </div>
        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BatchEnrollModal({ classPeriod, students, enrolledIds, onClose, onSaved }: {
  classPeriod: ClassPeriod;
  students: Profile[];
  enrolledIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(enrolledIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = classPeriod.class as unknown as ClassRoom | null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    const toAdd = [...selected].filter((id) => !enrolledIds.has(id));
    const toRemove = [...enrolledIds].filter((id) => !selected.has(id));

    if (toAdd.length > 0) {
      const { error: insErr } = await supabase.from("class_enrollments").insert(
        toAdd.map((studentId) => ({
          student_id: studentId,
          class_id: classPeriod.class_id,
          class_period_id: classPeriod.id,
        })),
      );
      if (insErr) { setError(insErr.message); setLoading(false); return; }
    }
    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from("class_enrollments")
        .delete()
        .eq("class_period_id", classPeriod.id)
        .in("student_id", toRemove);
      if (delErr) { setError(delErr.message); setLoading(false); return; }
    }
    setLoading(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title={`Plot Siswa — ${cls?.name ?? ""}`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Pilih siswa yang akan dimasukkan ke kelas ini untuk periode aktif.
          {selected.size} siswa dipilih.
        </p>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {students.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Belum ada siswa.</div>
          ) : students.map((s) => (
            <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50/50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="font-medium text-slate-800">{s.full_name}</span>
              {s.identifier && <span className="text-xs text-slate-400">({s.identifier})</span>}
            </label>
          ))}
        </div>
        {error && (
          <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700">{error}</div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? <Spinner size={16} /> : null} Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================
   Grade Recap (Kepala Sekolah — all classes)
   ============================ */
export function AdminGrades() {
  const { activeAcademicYear, activeSemester } = useSchoolSettings();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [semester, setSemester] = useState<string>(activeSemester?.semester_name ?? "Ganjil");
  const [academicYear, setAcademicYear] = useState<string>(activeAcademicYear?.year_name ?? "2026/2027");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("classes").select("*").order("name"),
        supabase.from("subjects").select("*").order("name"),
      ]);
      setClasses(c.data as ClassRoom[] ?? []);
      setSubjects(s.data as Subject[] ?? []);
      setLoading(false);
    })();
  }, []);

  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;
  const canGenerate = !!selectedClass && !!semester && !!academicYear;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rekap Nilai (Rapor)</h1>
          <p className="text-sm text-slate-500 mt-1">Pilih kelas, semester, dan tahun ajaran untuk melihat rekap nilai</p>
        </div>
      </div>

      <div className="card p-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Pilih Kelas</label>
            <select className="input" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              <option value="">Pilih kelas...</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (Tingkat ${c.level})` : ""}</option>)}
            </select>
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

      {loading ? <div className="flex justify-center py-12"><Spinner size={28} /></div> :
        selectedClass && canGenerate ? (
          <GradeRecapReport
            classRoom={selectedClass}
            subjects={subjects}
            semester={semester}
            academicYear={academicYear}
          />
        ) : (
          <EmptyState
            icon={<ScrollText size={28} />}
            title="Pilih kelas"
            description="Pilih kelas, semester, dan tahun ajaran untuk melihat rekap nilai dalam bentuk matriks rapor."
          />
        )
      }
    </div>
  );
}

/* ============================
   Audit Logs
   ============================ */
export function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*, student:profiles!student_id(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      setLogs(data as AuditLog[] ?? []);
      setLoading(false);
    })();
  }, []);

  const eventBadge = (type: string) => {
    if (type.includes("tab")) return <Badge color="error">Tab Switch</Badge>;
    if (type.includes("offline")) return <Badge color="warning">Offline</Badge>;
    if (type.includes("submit")) return <Badge color="success">Submit</Badge>;
    return <Badge>{type}</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Log kejadian mencurigakan & status ujian</p>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size={28} /></div> :
        <div className="card overflow-x-auto">
          {logs.length === 0 ? <EmptyState icon={<Shield size={28} />} title="Belum ada log" description="Belum ada kejadian tercatat." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Waktu</th>
                <th className="px-4 py-3 font-medium">Siswa</th>
                <th className="px-4 py-3 font-medium">Kejadian</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{l.student?.full_name ?? "-"}</td>
                    <td className="px-4 py-3">{eventBadge(l.event_type)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{JSON.stringify(l.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      }
    </div>
  );
}

/* ============================
   Admin Question Bank (all teachers)
   ============================ */
export function AdminQuestionBank() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [viewQuestion, setViewQuestion] = useState<Question | null>(null);
  const [reviewQuestion, setReviewQuestion] = useState<Question | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LEVELS = ["7", "8", "9"];

  const load = useCallback(async () => {
    setLoading(true);
    const [q, s, t] = await Promise.all([
      supabase.from("questions").select("*, subject:subjects(*), class:classes(*), teacher:profiles!teacher_id(full_name), reviewer:profiles!reviewed_by(full_name)").order("created_at", { ascending: false }),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("profiles").select("*").eq("role", "teacher").order("full_name"),
    ]);
    setQuestions(q.data as Question[] ?? []);
    setSubjects(s.data as Subject[] ?? []);
    setTeachers(t.data as Profile[] ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const filtered = questions.filter((q) => {
    if (filterSubject && q.subject_id !== filterSubject) return false;
    if (filterLevel && q.class_level !== filterLevel) return false;
    if (filterStatus && q.verification_status !== filterStatus) return false;
    if (filterTeacher && q.teacher_id !== filterTeacher) return false;
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      const teacherName = q.teacher?.full_name ?? "";
      const subjectName = q.subject?.name ?? "";
      if (!q.content.toLowerCase().includes(s) &&
          !teacherName.toLowerCase().includes(s) &&
          !subjectName.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);

  const stats = {
    total: questions.length,
    pending: questions.filter((q) => q.verification_status === "pending_review").length,
    approved: questions.filter((q) => q.verification_status === "approved").length,
    draft: questions.filter((q) => q.verification_status === "draft").length,
  };

  const statusBadge = (status: QuestionVerificationStatus) => {
    const colors: Record<QuestionVerificationStatus, "slate" | "warning" | "success"> = {
      draft: "slate",
      pending_review: "warning",
      approved: "success",
    };
    return <Badge color={colors[status]}>{QUESTION_STATUS_LABELS[status]}</Badge>;
  };

  useEffect(() => { setPage(0); }, [filterSubject, filterLevel, filterStatus, filterTeacher, pageSize]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bank Soal</h1>
          <p className="text-sm text-slate-500 mt-1">Supervisi soal dari semua guru</p>
        </div>
        {/* Supervision stats badges */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <Layers size={16} className="text-slate-500" />
            <div>
              <p className="text-xs text-slate-400">Total Soal</p>
              <p className="text-sm font-bold text-slate-700">{stats.total}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-warning-50 border border-warning-200 px-3 py-2">
            <AlertCircle size={16} className="text-warning-600" />
            <div>
              <p className="text-xs text-warning-600">Menunggu Review</p>
              <p className="text-sm font-bold text-warning-700">{stats.pending}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-success-50 border border-success-200 px-3 py-2">
            <CheckCircle size={16} className="text-success-600" />
            <div>
              <p className="text-xs text-success-600">Disetujui</p>
              <p className="text-sm font-bold text-success-700">{stats.approved}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Cari soal, mapel, atau nama guru..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className="input" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="">Semua Mapel</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
            <option value="">Semua Tingkat</option>
            {LEVELS.map((l) => <option key={l} value={l}>Tingkat {l}</option>)}
          </select>
          <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Menunggu Review</option>
            <option value="approved">Disetujui</option>
          </select>
          <select className="input" value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)}>
            <option value="">Semua Guru</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<BookOpenCheck size={28} />} title="Belum ada soal" description="Soal yang dibuat guru akan muncul di sini untuk supervisi." />
      ) : (
        <div className="space-y-3">
          {paged.map((q) => (
            <div key={q.id} className="card p-5 group hover:shadow-cardHover transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewQuestion(q)}>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge color="accent">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                    <Badge color="slate">{q.subject?.name}</Badge>
                    <Badge color="brand">{targetLabelForQuestion(q)}</Badge>
                    <Badge color="warning">{q.points} poin</Badge>
                    {statusBadge(q.verification_status)}
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2">{q.content}</p>
                  <p className="text-xs text-slate-400 mt-1">oleh {q.teacher?.full_name ?? "Guru"}</p>
                  {q.review_note && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-50 border border-warning-200 px-3 py-2">
                      <MessageSquare size={14} className="text-warning-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 line-clamp-2">{q.review_note}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setViewQuestion(q)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Lihat Detail"><Eye size={16} /></button>
                  <button onClick={() => setReviewQuestion(q)} className="p-2 rounded-lg text-brand-400 hover:bg-brand-50 hover:text-brand-600" title="Beri Review"><MessageSquare size={16} /></button>
                  {q.verification_status !== "approved" && (
                    <button
                      onClick={async () => {
                        await supabase.rpc("submit_question_review", { p_question_id: q.id, p_status: "approved", p_note: null });
                        load();
                      }}
                      className="p-2 rounded-lg text-success-400 hover:bg-success-50 hover:text-success-600"
                      title="Setujui Langsung"
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Hal {currentPage + 1} / {totalPages}</span>
            <span className="text-slate-300">|</span>
            <select className="input w-auto py-1 text-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / hal</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 text-sm text-slate-600">{pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} dari {filtered.length}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {viewQuestion && (
        <Modal open={true} onClose={() => setViewQuestion(null)} title="Detail Soal" size="lg">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="accent">{QUESTION_TYPE_LABELS[viewQuestion.type]}</Badge>
              <Badge color="slate">{viewQuestion.subject?.name}</Badge>
              <Badge color="brand">{targetLabelForQuestion(viewQuestion)}</Badge>
              <Badge color="warning">{viewQuestion.points} poin</Badge>
              {statusBadge(viewQuestion.verification_status)}
              <span className="text-xs text-slate-400">oleh {(viewQuestion as any).teacher?.full_name ?? "Guru"}</span>
            </div>
            <div className="card bg-slate-50 border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{viewQuestion.content}</p>
            </div>
            {(viewQuestion.type === "pg" || viewQuestion.type === "pg_kompleks" || viewQuestion.type === "mcma") && viewQuestion.options.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">Pilihan Jawaban:</p>
                <div className="space-y-2">
                  {viewQuestion.options.map((opt: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
                      <span className="text-xs font-bold text-slate-400 w-6">{String.fromCharCode(65 + i)}.</span>
                      <span className="text-sm text-slate-700">{typeof opt === "string" ? opt : opt.label ?? opt.text ?? JSON.stringify(opt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {viewQuestion.correct_answer && (
              <div className="card bg-success-50 border-success-200 p-4">
                <p className="text-xs font-medium text-success-600 mb-1">Kunci Jawaban:</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{typeof viewQuestion.correct_answer === "string" ? viewQuestion.correct_answer : JSON.stringify(viewQuestion.correct_answer)}</p>
              </div>
            )}
            {viewQuestion.review_note && (
              <div className="rounded-lg bg-warning-50 border border-warning-200 p-4">
                <p className="text-xs font-medium text-warning-700 mb-1 flex items-center gap-1">
                  <MessageSquare size={14} /> Catatan Review dari KS
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{viewQuestion.review_note}</p>
                {viewQuestion.reviewed_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(viewQuestion.reviewed_at).toLocaleString("id-ID")}
                    {viewQuestion.reviewer?.full_name ? ` oleh ${viewQuestion.reviewer.full_name}` : ""}
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setViewQuestion(null)} className="btn-secondary">Tutup</button>
              <button onClick={() => { setViewQuestion(null); setReviewQuestion(viewQuestion); }} className="btn-primary">
                <MessageSquare size={16} /> Beri Review
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reviewQuestion && (
        <QuestionReviewModal
          question={reviewQuestion}
          onClose={() => setReviewQuestion(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

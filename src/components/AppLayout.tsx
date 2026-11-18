import { type ReactNode, useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  CheckSquare,
  Shield,
  LogOut,
  Settings,
  Menu,
  X,
  School,
  ScrollText,
  FileText,
  Palette,
  CalendarClock,
  BookOpenCheck,
  ClipboardCheck,
  Monitor,
  Sun,
  Moon,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useThemeMode } from "@/lib/themeMode";
import { navigate, useHashRoute } from "@/lib/router";
import { PORTAL_THEMES, portalForRole } from "@/lib/portalTheme";
import { SchoolLogo } from "@/components/SchoolLogo";
import { ProfileSettingsModal } from "@/components/ProfileSettingsModal";
import { useExamInProgress } from "@/lib/examLock";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import type { Role } from "@/lib/types";

function toTitleCase(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const NAV: Record<Role, NavItem[]> = {
  super_admin: [
    { label: "Dashboard", path: "/admin", icon: <LayoutDashboard size={18} /> },
    { label: "Branding", path: "/admin/branding", icon: <Palette size={18} /> },
    { label: "Manajemen User", path: "/admin/users", icon: <Users size={18} /> },
    { label: "Kelas & Mapel", path: "/admin/academics", icon: <School size={18} /> },
    { label: "Periode Akademik", path: "/admin/periods", icon: <CalendarClock size={18} /> },
    { label: "Penugasan Guru", path: "/admin/assignments", icon: <ClipboardList size={18} /> },
    { label: "Rekap Nilai", path: "/admin/grades", icon: <ScrollText size={18} /> },
    { label: "Bank Soal", path: "/admin/bank-soal", icon: <BookOpenCheck size={18} /> },
    { label: "Ujian", path: "/admin/ujian", icon: <CalendarClock size={18} /> },
    { label: "Pemantauan Ujian", path: "/admin/pemantauan", icon: <Monitor size={18} /> },
    { label: "Persetujuan Ujian", path: "/admin/persetujuan", icon: <ClipboardCheck size={18} /> },
    { label: "Audit Log", path: "/admin/audit", icon: <Shield size={18} /> },
  ],
  teacher: [
    { label: "Dashboard", path: "/guru", icon: <LayoutDashboard size={18} /> },
    { label: "Bank Soal", path: "/guru/soal", icon: <BookOpen size={18} /> },
    { label: "Ujian", path: "/guru/ujian", icon: <CalendarClock size={18} /> },
    { label: "Pemantauan Ujian", path: "/guru/pemantauan", icon: <Monitor size={18} /> },
    { label: "Koreksi Uraian", path: "/guru/koreksi", icon: <CheckSquare size={18} /> },
    { label: "Rapor Kelas", path: "/guru/rapor", icon: <ScrollText size={18} /> },
  ],
  student: [
    { label: "Dashboard", path: "/siswa", icon: <LayoutDashboard size={18} /> },
    { label: "Nilai Saya", path: "/siswa/nilai", icon: <FileText size={18} /> },
  ],
};

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Kepala Sekolah",
  teacher: "Guru",
  student: "Siswa",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, isHomeroom } = useAuth();
  const { mode, toggle } = useThemeMode();
  const [path] = useHashRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const examInProgress = useExamInProgress(profile?.id, path);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!profile) return null;

  const portal = portalForRole(profile.role);
  const theme = PORTAL_THEMES[portal];
  const allItems = NAV[profile.role];
  const items = allItems.filter((item) => {
    if (item.path === "/guru/rapor") return isHomeroom;
    return true;
  });
  const displayName = toTitleCase(profile.full_name);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-slate-200/70 dark:border-slate-800">
        <SchoolLogo portal={portal} />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active =
            path === item.path ||
            (item.path !== `/${profile.role === "super_admin" ? "admin" : profile.role === "teacher" ? "guru" : "siswa"}` &&
              path.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? theme.navActive
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <span className={active ? theme.navIcon : "text-slate-400 dark:text-slate-500"}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-200/70 dark:border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <ProfileAvatar profile={profile} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {displayName}
            </p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
          </div>
        </div>
        {!examInProgress && (
          <button
            onClick={() => setShowProfileSettings(true)}
            className="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20 transition"
          >
            <Settings size={18} />
            Pengaturan Profil
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20 transition"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>

      {showProfileSettings && (
        <ProfileSettingsModal onClose={() => setShowProfileSettings(false)} />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800 flex-col fixed inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-white dark:bg-slate-900 flex flex-col animate-slide-up">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 min-w-0">
        {/* Desktop topbar */}
        <header className="no-print hidden lg:flex sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/70 dark:border-slate-800 px-6 py-3 items-center justify-between">
          <div className="text-base text-slate-400 dark:text-slate-500">
            Selamat datang, <span className="font-medium text-slate-600 dark:text-slate-300">{displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              isOnline
                ? "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                : "bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400"
            }`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isOnline ? "Online" : "Offline"}
            </div>
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={mode === "light" ? "Mode Gelap" : "Mode Terang"}
            >
              {mode === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {/* Mobile topbar */}
        <header className="no-print lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu size={22} />
          </button>
          <SchoolLogo portal={portal} compact />
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-success-500" : "bg-error-500"}`} title={isOnline ? "Online" : "Offline"} />
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {mode === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}

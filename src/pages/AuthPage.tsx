import { useState, type FormEvent } from "react";
import {
  Mail, Lock, Eye, EyeOff, Info, ArrowRight, ShieldCheck,
  BookOpenCheck, MonitorCog, Clock, CheckCircle2, CloudUpload,
  BarChart3, FileSpreadsheet, CheckCheck, FileDown,
  LayoutDashboard, ScrollText, Printer,
  KeyRound, X, LifeBuoy, GraduationCap, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { enforceSingleSession, consumeSessionRevokedNotice } from "@/lib/sessionGuard";
import { getRememberMe, getRememberedEmail, saveRememberedEmail, setRememberMe } from "@/lib/rememberMe";
import { Spinner } from "@/components/ui";
import { SchoolLogo } from "@/components/SchoolLogo";
import type { Role } from "@/lib/types";

type RoleKey = "super_admin" | "teacher" | "student";

interface RoleTheme {
  label: string;
  short: string;
  badgeBg: string;
  badgeText: string;
  panelGradient: string;
  panelBlob: string;
  panelBlob2: string;
  ringColor: string;
  ringOffset: string;
  buttonBg: string;
  buttonHover: string;
  eyebrow: string;
  tabActive: string;
  tabActiveText: string;
  tabGlow: string;
  featureIcon: string;
  featureIconHover: string;
  alertBg: string;
  alertBorder: string;
  alertIcon: string;
  focusRing: string;
  focusBorder: string;
  dotColor: string;
}

const ROLE_THEMES: Record<RoleKey, RoleTheme> = {
  super_admin: {
    label: "Kepala Sekolah",
    short: "Admin",
    badgeBg: "bg-amber-500",
    badgeText: "text-amber-950",
    panelGradient: "from-amber-600 via-amber-700 to-orange-800",
    panelBlob: "bg-orange-300",
    panelBlob2: "bg-amber-200",
    ringColor: "ring-amber-400/50",
    ringOffset: "ring-offset-amber-500",
    buttonBg: "bg-amber-600",
    buttonHover: "hover:bg-amber-700",
    eyebrow: "text-amber-700",
    tabActive: "bg-amber-500",
    tabActiveText: "text-white",
    tabGlow: "shadow-amber-500/30",
    featureIcon: "text-amber-300",
    featureIconHover: "group-hover:bg-white/25 group-hover:scale-110",
    alertBg: "bg-amber-50",
    alertBorder: "border-amber-200",
    alertIcon: "text-amber-600",
    focusRing: "focus:ring-amber-500/20",
    focusBorder: "focus:border-amber-500",
    dotColor: "bg-amber-400",
  },
  teacher: {
    label: "Guru",
    short: "Guru",
    badgeBg: "bg-blue-600",
    badgeText: "text-blue-50",
    panelGradient: "from-blue-700 via-blue-800 to-indigo-900",
    panelBlob: "bg-blue-400",
    panelBlob2: "bg-indigo-300",
    ringColor: "ring-blue-400/50",
    ringOffset: "ring-offset-blue-600",
    buttonBg: "bg-blue-700",
    buttonHover: "hover:bg-blue-800",
    eyebrow: "text-blue-700",
    tabActive: "bg-blue-600",
    tabActiveText: "text-white",
    tabGlow: "shadow-blue-500/30",
    featureIcon: "text-blue-300",
    featureIconHover: "group-hover:bg-white/25 group-hover:scale-110",
    alertBg: "bg-blue-50",
    alertBorder: "border-blue-200",
    alertIcon: "text-blue-600",
    focusRing: "focus:ring-blue-500/20",
    focusBorder: "focus:border-blue-600",
    dotColor: "bg-blue-400",
  },
  student: {
    label: "Siswa",
    short: "Siswa",
    badgeBg: "bg-emerald-500",
    badgeText: "text-emerald-950",
    panelGradient: "from-emerald-600 via-emerald-700 to-teal-800",
    panelBlob: "bg-teal-300",
    panelBlob2: "bg-emerald-200",
    ringColor: "ring-emerald-400/50",
    ringOffset: "ring-offset-emerald-500",
    buttonBg: "bg-emerald-600",
    buttonHover: "hover:bg-emerald-700",
    eyebrow: "text-emerald-700",
    tabActive: "bg-emerald-500",
    tabActiveText: "text-white",
    tabGlow: "shadow-emerald-500/30",
    featureIcon: "text-emerald-300",
    featureIconHover: "group-hover:bg-white/25 group-hover:scale-110",
    alertBg: "bg-emerald-50",
    alertBorder: "border-emerald-200",
    alertIcon: "text-emerald-600",
    focusRing: "focus:ring-emerald-500/20",
    focusBorder: "focus:border-emerald-500",
    dotColor: "bg-emerald-400",
  },
};

const ROLE_COPY: Record<RoleKey, { tagline: string; subtitle: string; title: string }> = {
  super_admin: {
    title: "Masuk sebagai Kepala Sekolah",
    tagline: "Panel Pengawasan Ujian",
    subtitle: "Kelola akun, akademik, dan audit sekolah dalam satu panel terpadu.",
  },
  teacher: {
    title: "Masuk sebagai Guru",
    tagline: "Portal Manajemen Evaluasi",
    subtitle: "Susun soal, jadwalkan ujian, dan koreksi nilai dengan mudah.",
  },
  student: {
    title: "Masuk ke Akun Siswa",
    tagline: "Selamat Datang di Portal Ujian",
    subtitle: "Masuk untuk melanjutkan ujian dan melihat hasil nilai Anda.",
  },
};

interface PanelFeature {
  icon: typeof GraduationCap;
  title: string;
  desc: string;
}

const ROLE_PANEL: Record<RoleKey, { subtitle: string; features: PanelFeature[] }> = {
  student: {
    subtitle: "Sistem Computer Based Test yang stabil dan adil untuk seluruh siswa. Didesain agar ujian berjalan lancar tanpa kendala.",
    features: [
      { icon: ShieldCheck, title: "Ujian Jujur & Tertib", desc: "Proteksi layar penuh & otomatis mendeteksi perpindahan tab browser." },
      { icon: CloudUpload, title: "Penyimpanan Otomatis (Auto-Save)", desc: "Jawaban tersimpan otomatis, aman dari kendala sinyal atau mati listrik." },
      { icon: Clock, title: "Timer Ujian Real-Time", desc: "Menampilkan sisa waktu ujian dengan jelas dan pengingat waktu otomatis." },
      { icon: BookOpenCheck, title: "Ragam Tipe Soal", desc: "Mendukung Pilihan Ganda, PG Kompleks, MCMA, dan Uraian." },
      { icon: BarChart3, title: "Transparansi Nilai", desc: "Hasil nilai dapat langsung dilihat setelah ujian selesai." },
    ],
  },
  teacher: {
    subtitle: "Platform manajemen ujian lengkap untuk guru. Memudahkan pembuatan bank soal, penjadwalan, hingga rekapitulasi nilai.",
    features: [
      { icon: FileSpreadsheet, title: "Bank Soal Fleksibel", desc: "Impor soal dari Excel (Mendukung 4+ tipe soal & media gambar/rumus)." },
      { icon: KeyRound, title: "Manajemen Token & Jadwal", desc: "Kontrol acak soal, alokasi token, dan jadwal sesi per kelas." },
      { icon: MonitorCog, title: "Pemantauan Real-Time", desc: "Awasi aktivitas pengerjaan siswa dan status kecurangan secara langsung." },
      { icon: CheckCheck, title: "Koreksi Otomatis", desc: "Penilaian otomatis untuk soal PG dan PG Kompleks, MCMA begitu ujian selesai." },
      { icon: FileDown, title: "Ekspor Laporan Cepat", desc: "Unduh rekapitulasi nilai dan analisis butir soal langsung ke format Excel." },
    ],
  },
  super_admin: {
    subtitle: "Pusat kendali dan analitik evaluasi pembelajaran. Memantau pelaksanaan ujian dan capaian akademik sekolah.",
    features: [
      { icon: LayoutDashboard, title: "Dashboard Ringkasan Eksekutif", desc: "Pantau tingkat partisipasi dan rata-rata nilai per mata pelajaran." },
      { icon: Users, title: "Manajemen Akun Terpusat", desc: "Pengaturan hak akses pengguna untuk Guru, Staf, dan Siswa." },
      { icon: BarChart3, title: "Analisis Capaian Mutu", desc: "Grafik statistik ketercapaian dan perbandingan hasil antar kelas." },
      { icon: ScrollText, title: "Audit Sistem & Keamanan", desc: "Rekam jejak (log) pelaksanaan ujian sekolah yang transparan." },
      { icon: Printer, title: "Laporan Resmi Sekolah", desc: "Cetak laporan hasil Ujian Sekolah (CBT) untuk evaluasi kurikulum." },
    ],
  },
};

const ROLE_TABS: { key: RoleKey; label: string; icon: typeof GraduationCap }[] = [
  { key: "student", label: "Siswa", icon: GraduationCap },
  { key: "teacher", label: "Guru", icon: Users },
  { key: "super_admin", label: "Kepala Sekolah", icon: ShieldCheck },
];

const ROUTE_FOR_ROLE: Record<RoleKey, string> = {
  super_admin: "/admin",
  teacher: "/guru",
  student: "/",
};

export function AuthPage({ role: initialRole }: { role?: Role }) {
  const [activeRole, setActiveRole] = useState<RoleKey>(initialRole ?? "student");
  const [email, setEmail] = useState(() => getRememberedEmail());
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => getRememberMe());
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeSessionRevokedNotice());
  const [showHelp, setShowHelp] = useState(false);

  const theme = ROLE_THEMES[activeRole];
  const copy = ROLE_COPY[activeRole];
  const panel = ROLE_PANEL[activeRole];

  const handleRoleSwitch = (key: RoleKey) => {
    setActiveRole(key);
    setError(null);
    const hashPath = key === "super_admin" ? "#/admin" : key === "teacher" ? "#/guru" : "#/login";
    if (window.location.hash !== hashPath) window.location.hash = hashPath;
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRememberMe(remember);
    saveRememberedEmail(remember ? email : null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    try {
      await enforceSingleSession();
    } catch {
      // Session enforcement failed (e.g. function temporarily unavailable),
      // but login itself succeeded. Continue to the dashboard rather than
      // signing the user out — the 15-second interval will enforce sessions.
    }
    setLoading(false);
    navigate(ROUTE_FOR_ROLE[activeRole]);
  };

  return (
    <div className="min-h-screen lg:h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50 overflow-hidden">
      {/* === LEFT PANEL === */}
      <div className={`hidden lg:flex relative overflow-hidden h-full bg-gradient-to-br ${theme.panelGradient} transition-all duration-700 ease-in-out`}>
        {/* Decorative blobs */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-24 left-16 w-72 h-72 rounded-full bg-white blur-3xl transition-all duration-700" />
          <div className={`absolute bottom-24 right-10 w-96 h-96 rounded-full ${theme.panelBlob} blur-3xl transition-all duration-700`} />
          <div className={`absolute top-1/2 right-1/3 w-40 h-40 rounded-full ${theme.panelBlob2} blur-2xl transition-all duration-700`} />
        </div>
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 flex flex-col justify-between h-full p-6 lg:p-8 w-full overflow-hidden">
          {/* School branding header — full width, dikunci agar tidak menyusut */}
          <div className="flex-shrink-0 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-4 shadow-lg w-full transition-all duration-500">
            <SchoolLogo onDark xl />
          </div>

          {/* Main content — re-mounts per role so fade/slide transition replays */}
          <div key={activeRole} className="flex flex-col gap-5 text-white animate-fade-slide">
            <div className="w-full">
              <h1 className="text-2xl lg:text-3xl font-bold leading-tight mb-2">
                {copy.tagline}
              </h1>
              <p className="text-white/70 text-sm leading-snug line-clamp-2">
                {panel.subtitle}
              </p>
            </div>

            {/* Feature list — compact grid, 5 cards muat tanpa scroll */}
            <div className="w-full grid grid-cols-1 gap-2">
              {panel.features.map((f, i) => (
                <div
                  key={f.title}
                  className="flex items-center gap-2.5 group bg-white/10 backdrop-blur-sm rounded-lg py-2 px-3 transition-all duration-300 hover:bg-white/15 animate-fade-slide"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className={`w-7 h-7 rounded-md bg-white/15 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${theme.featureIcon} ${theme.featureIconHover}`}>
                    <f.icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white leading-tight">{f.title}</p>
                    <p className="text-[11px] text-white/65 leading-tight mt-0.5 line-clamp-1">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer — dikunci agar tidak terdorong */}
          <div className="flex-shrink-0 text-white/50 text-xs">
            &copy; {new Date().getFullYear()} Ujian Sekolah. Platform CBT terintegrasi.
          </div>
        </div>
      </div>

      {/* === RIGHT PANEL === */}
      <div className="flex items-center justify-center h-full p-5 sm:p-8 lg:p-10 overflow-y-auto">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <SchoolLogo portal={activeRole === "super_admin" ? "admin" : activeRole === "teacher" ? "teacher" : "brand"} large />
          </div>

          {/* Role tab bar — pill active style */}
          <div className="flex p-1.5 rounded-full bg-slate-100 border border-slate-200 mb-8 transition-all duration-300">
            {ROLE_TABS.map((tab) => {
              const active = activeRole === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleRoleSwitch(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    active
                      ? `${theme.tabActive} ${theme.tabActiveText} shadow-md ${theme.tabGlow}`
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Role badge + heading */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${theme.badgeBg} ${theme.badgeText} mb-3 transition-all duration-500`}>
            <CheckCircle2 size={12} />
            {copy.title.replace("Masuk sebagai ", "").replace("Masuk ke Akun ", "Akun ")}
          </div>
          <h2 className="text-2xl font-bold text-slate-800 transition-all duration-300">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm text-slate-500 transition-all duration-300">{copy.subtitle}</p>

          {/* Form */}
          <form onSubmit={handleLogin} className="mt-7 space-y-5">
            {/* Email */}
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  className={`input pl-10 transition-all duration-300 ${theme.focusBorder} ${theme.focusRing}`}
                  placeholder="email@sekolah.sch.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input pl-10 pr-10 transition-all duration-300 ${theme.focusBorder} ${theme.focusRing}`}
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Help link */}
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600 cursor-pointer"
                />
                Ingat saya
              </label>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline transition-colors"
              >
                Bantuan / Lupa Password
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-error-50 border border-error-200 px-4 py-3 text-sm text-error-700 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit button — micro-interaction hover lift */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-300 ${theme.buttonBg} ${theme.buttonHover} hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
            >
              {loading ? <Spinner size={18} /> : <ArrowRight size={18} />}
              Masuk
            </button>
          </form>

          {/* Info alert — clean alert box */}
          <div className={`mt-6 rounded-xl border px-4 py-3.5 flex items-start gap-2.5 transition-all duration-500 ${theme.alertBg} ${theme.alertBorder}`}>
            <Info size={18} className={`flex-shrink-0 mt-0.5 transition-all duration-500 ${theme.alertIcon}`} />
            <p className="text-xs text-slate-600 leading-relaxed">
              Pendaftaran akun baru dilakukan oleh <span className="font-semibold text-slate-700">Kepala Sekolah</span> melalui
              panel Manajemen User. Silakan hubungi Kepala Sekolah untuk mendapatkan akun.
            </p>
          </div>
        </div>
      </div>

      {/* Help / Reset Password modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-5 py-4 ${theme.buttonBg} text-white`}>
              <div className="flex items-center gap-2.5">
                <LifeBuoy size={20} />
                <h3 className="text-base font-bold">Bantuan & Lupa Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Tutup"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${theme.alertBg} ${theme.alertBorder}`}>
                <KeyRound size={20} className={`flex-shrink-0 mt-0.5 ${theme.alertIcon}`} />
                <div className="text-sm text-slate-600 leading-relaxed space-y-2">
                  <p>
                    Jika Anda lupa password, silakan hubungi <span className="font-semibold text-slate-700">Kepala Sekolah</span> untuk
                    melakukan reset password akun Anda.
                  </p>
                  <p>
                    Kepala Sekolah akan mereset password lama dan memberikan password baru melalui panel <span className="font-semibold text-slate-700">Manajemen User</span>.
                    Setelah menerima password baru, Anda dapat langsung masuk dan mengganti password tersebut dari pengaturan profil.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-600">Catatan:</span> Demi keamanan, reset password tidak dapat dilakukan
                sendiri oleh pengguna. Hanya Kepala Sekolah yang berwenang mengelola kredensial akun.
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 ${theme.buttonBg} ${theme.buttonHover} active:scale-[0.98]`}
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { School } from "lucide-react";
import { PORTAL_THEMES, type PortalKey } from "@/lib/portalTheme";
import { useSchoolSettings } from "@/lib/schoolSettings";

export function SchoolLogo({ portal = "brand", onDark = false, compact = false, large = false, xl = false }: {
  portal?: PortalKey;
  onDark?: boolean;
  compact?: boolean;
  large?: boolean;
  xl?: boolean;
}) {
  const { settings } = useSchoolSettings();
  const logoUrl = settings?.logo_url ?? null;
  const schoolName = settings?.school_name.trim() || "Ujian Sekolah";
  const academicYear = settings?.academic_year.trim();
  const subtitle = academicYear ? `Tahun Ajaran ${academicYear}` : "Sistem CBT Online";

  const badge = logoUrl
    ? onDark
      ? "bg-white/10 backdrop-blur-sm ring-1 ring-white/20"
      : "bg-white ring-1 ring-slate-200"
    : onDark
      ? "bg-white/10 backdrop-blur-sm text-white ring-1 ring-white/20"
      : PORTAL_THEMES[portal].logoBadge;
  const sizeClass = compact
    ? "w-9 h-9 rounded-lg"
    : xl
      ? "w-20 h-20 rounded-full"
      : large
        ? "w-16 h-16 rounded-full"
        : "w-10 h-10 rounded-xl";
  const imagePadding = xl || large ? "p-1.5" : "p-1";
  const iconSize = compact ? 18 : xl ? 36 : large ? 30 : 20;
  const roomy = xl || large;

  return (
    <div className={`flex items-center min-w-0 ${roomy ? "gap-4" : "gap-3"}`}>
      <div className={`${sizeClass} ${badge} overflow-hidden flex items-center justify-center flex-shrink-0`}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo sekolah"
            className={`w-full h-full max-w-full max-h-full object-contain ${imagePadding}`}
          />
        ) : (
          <School size={iconSize} />
        )}
      </div>
      <div className="min-w-0">
        <p className={`leading-snug line-clamp-2 ${onDark ? "text-white" : "text-slate-800"} ${xl ? "text-xl font-bold tracking-tight" : large ? "text-lg font-bold tracking-tight" : "text-sm font-bold"}`}>
          {schoolName}
        </p>
        <p className={`leading-tight truncate ${onDark ? "text-white/80" : "text-slate-500"} ${roomy ? "text-sm font-medium" : "text-xs"}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

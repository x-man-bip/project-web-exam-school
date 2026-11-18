import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { AcademicYear, Semester } from "./types";
import { DEFAULT_THEME, applyThemeToDocument, normalizeTheme, type ThemeConfig } from "./themeConfig";

export interface SchoolSettings {
  school_name: string;
  academic_year: string;
  logo_url: string | null;
  theme: ThemeConfig;
  ip_allowlist: string;
  require_seb: boolean;
}

interface SchoolSettingsContextValue {
  settings: SchoolSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  activeAcademicYear: AcademicYear | null;
  activeSemester: Semester | null;
  academicYears: AcademicYear[];
  semesters: Semester[];
}

const SchoolSettingsContext = createContext<SchoolSettingsContextValue | null>(null);

function isSchoolSettings(value: unknown): value is Omit<SchoolSettings, "theme"> & { theme?: unknown } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.school_name === "string" &&
    typeof v.academic_year === "string" &&
    (v.logo_url === null || typeof v.logo_url === "string")
  );
}

export function SchoolSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYear | null>(null);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const refresh = useCallback(async () => {
    const [settingsRes, yearsRes, semestersRes] = await Promise.all([
      supabase
        .from("school_settings")
        .select("school_name, academic_year, logo_url, theme, ip_allowlist, require_seb")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("academic_years").select("*").order("year_name"),
      supabase.from("semesters").select("*").order("created_at"),
    ]);
    setSettings(
      !settingsRes.error && isSchoolSettings(settingsRes.data)
        ? { ...settingsRes.data, theme: normalizeTheme(settingsRes.data.theme) }
        : null,
    );
    const years = (yearsRes.data as AcademicYear[]) ?? [];
    const sems = (semestersRes.data as Semester[]) ?? [];
    setAcademicYears(years);
    setSemesters(sems);
    setActiveAcademicYear(years.find((y) => y.is_active) ?? null);
    setActiveSemester(sems.find((s) => s.is_active) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    applyThemeToDocument(settings?.theme ?? DEFAULT_THEME);
  }, [settings]);

  return (
    <SchoolSettingsContext.Provider
      value={{ settings, loading, refresh, activeAcademicYear, activeSemester, academicYears, semesters }}
    >
      {children}
    </SchoolSettingsContext.Provider>
  );
}

export function useSchoolSettings(): SchoolSettingsContextValue {
  const ctx = useContext(SchoolSettingsContext);
  if (!ctx) throw new Error("useSchoolSettings must be used inside SchoolSettingsProvider");
  return ctx;
}

export function normalizeAcademicYear(raw: string | undefined | null): string {
  if (!raw) return "2026/2027";
  const match = raw.match(/\d{4}\/\d{4}/);
  return match ? match[0] : raw.trim();
}


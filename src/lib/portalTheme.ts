import type { Role } from "@/lib/types";

export type PortalKey = "brand" | "admin" | "teacher";

export interface PortalTheme {
  logoBadge: string;
  panel: string;
  panelText: string;
  panelBlob: string;
  pageBg: string;
  eyebrow: string;
  button: string;
  quickLinkActive: string;
  navActive: string;
  navIcon: string;
  avatar: string;
  chip: string;
}

export const PORTAL_THEMES: Record<PortalKey, PortalTheme> = {
  // Student — emerald/green
  brand: {
    logoBadge: "bg-emerald-600 text-white shadow-sm",
    panel: "bg-gradient-to-br from-emerald-600 to-teal-700",
    panelText: "text-white/80",
    panelBlob: "bg-teal-300",
    pageBg: "bg-emerald-50/40",
    eyebrow: "text-emerald-700",
    button: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    quickLinkActive: "border-emerald-600 bg-emerald-50 text-emerald-700",
    navActive: "bg-emerald-50 text-emerald-700",
    navIcon: "text-emerald-600",
    avatar: "role-avatar-student",
    chip: "role-chip-student",
  },
  // Admin (Kepala Sekolah) — amber/gold
  admin: {
    logoBadge: "bg-amber-600 text-white shadow-sm",
    panel: "bg-gradient-to-br from-amber-600 to-orange-700",
    panelText: "text-white/80",
    panelBlob: "bg-orange-300",
    pageBg: "bg-amber-50/40",
    eyebrow: "text-amber-700",
    button: "bg-amber-600 text-white hover:bg-amber-700 shadow-sm",
    quickLinkActive: "border-amber-600 bg-amber-50 text-amber-700",
    navActive: "bg-amber-50 text-amber-700",
    navIcon: "text-amber-600",
    avatar: "role-avatar-admin",
    chip: "role-chip-admin",
  },
  // Teacher — blue
  teacher: {
    logoBadge: "bg-blue-700 text-white shadow-sm",
    panel: "bg-gradient-to-br from-blue-700 to-indigo-800",
    panelText: "text-white/80",
    panelBlob: "bg-blue-400",
    pageBg: "bg-blue-50/40",
    eyebrow: "text-blue-700",
    button: "bg-blue-700 text-white hover:bg-blue-800 shadow-sm",
    quickLinkActive: "border-blue-700 bg-blue-50 text-blue-700",
    navActive: "bg-blue-50 text-blue-700",
    navIcon: "text-blue-600",
    avatar: "role-avatar-teacher",
    chip: "role-chip-teacher",
  },
};

export function portalForRole(role: Role | undefined): PortalKey {
  if (role === "super_admin") return "admin";
  if (role === "teacher") return "teacher";
  return "brand";
}

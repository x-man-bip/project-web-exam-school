export type GradientDirection = "to-right" | "to-bottom-right" | "radial" | "linear";
export type RoleKey = "admin" | "teacher" | "student";
export type Rgb = [number, number, number];

export interface RoleAccent {
  color: string;
  accent: string;
}

export interface ThemeConfig {
  primary: string;
  secondary: string;
  mode: "solid" | "gradient";
  direction: GradientDirection;
  stopStart: string;
  stopEnd: string;
  roles: Record<RoleKey, RoleAccent>;
}

export const ROLE_KEYS: RoleKey[] = ["admin", "teacher", "student"];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Kepala Sekolah",
  teacher: "Guru",
  student: "Siswa",
};

export const GRADIENT_DIRECTIONS: { value: GradientDirection; label: string }[] = [
  { value: "to-right", label: "Ke Kanan" },
  { value: "to-bottom-right", label: "Ke Kanan Bawah" },
  { value: "linear", label: "Linear (Diagonal)" },
  { value: "radial", label: "Radial" },
];

export const GRADIENT_PRESETS: { name: string; start: string; end: string }[] = [
  { name: "Ocean Blue", start: "#0ea5e9", end: "#1e3a8a" },
  { name: "Emerald Sunset", start: "#10b981", end: "#f59e0b" },
  { name: "Royal Purple", start: "#7c3aed", end: "#4c1d95" },
  { name: "Midnight Tech", start: "#38bdf8", end: "#0f172a" },
  { name: "Warm Crimson", start: "#f97316", end: "#9f1239" },
];

export const DEFAULT_THEME: ThemeConfig = {
  primary: "#1f47f5",
  secondary: "#0891b2",
  mode: "solid",
  direction: "to-bottom-right",
  stopStart: "#1f47f5",
  stopEnd: "#0891b2",
  roles: {
    admin: { color: "#6d28d9", accent: "#d4a017" },
    teacher: { color: "#1e3a8a", accent: "#3b82f6" },
    student: { color: "#047857", accent: "#14b8a6" },
  },
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

function pickHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_RE.test(value) ? value.toLowerCase() : fallback;
}

export function normalizeTheme(value: unknown): ThemeConfig {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof ThemeConfig, unknown>>;
  const rawRoles = (raw.roles && typeof raw.roles === "object" ? raw.roles : {}) as Partial<Record<RoleKey, Partial<Record<keyof RoleAccent, unknown>>>>;

  const roleOf = (key: RoleKey): RoleAccent => ({
    color: pickHex(rawRoles[key]?.color, DEFAULT_THEME.roles[key].color),
    accent: pickHex(rawRoles[key]?.accent, DEFAULT_THEME.roles[key].accent),
  });

  return {
    primary: pickHex(raw.primary, DEFAULT_THEME.primary),
    secondary: pickHex(raw.secondary, DEFAULT_THEME.secondary),
    mode: raw.mode === "gradient" ? "gradient" : "solid",
    direction: GRADIENT_DIRECTIONS.some((d) => d.value === raw.direction)
      ? (raw.direction as GradientDirection)
      : DEFAULT_THEME.direction,
    stopStart: pickHex(raw.stopStart, DEFAULT_THEME.stopStart),
    stopEnd: pickHex(raw.stopEnd, DEFAULT_THEME.stopEnd),
    roles: { admin: roleOf("admin"), teacher: roleOf("teacher"), student: roleOf("student") },
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb: Rgb): string {
  return "#" + rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = ln - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const TINT_AMOUNT: Record<number, number> = { 50: 0.95, 100: 0.9, 200: 0.75, 300: 0.6, 400: 0.3, 500: 0.12 };
const SHADE_AMOUNT: Record<number, number> = { 700: 0.12, 800: 0.25, 900: 0.4, 950: 0.55 };

export function buildRamp(hex: string): Record<number, Rgb> {
  const base = hexToRgb(hex);
  const mixTo = (target: number, t: number): Rgb =>
    [0, 1, 2].map((i) => Math.round(base[i] + (target - base[i]) * t)) as Rgb;
  const ramp: Record<number, Rgb> = { 600: base };
  for (const [shade, t] of Object.entries(TINT_AMOUNT)) ramp[Number(shade)] = mixTo(255, t);
  for (const [shade, t] of Object.entries(SHADE_AMOUNT)) ramp[Number(shade)] = mixTo(0, t);
  return ramp;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hexToRgb(hex)) + 0.05);
}

export function fillValue(theme: ThemeConfig): string {
  if (theme.mode === "solid") return theme.primary;
  const { stopStart: s, stopEnd: e } = theme;
  switch (theme.direction) {
    case "to-right":
      return `linear-gradient(to right, ${s}, ${e})`;
    case "to-bottom-right":
      return `linear-gradient(to bottom right, ${s}, ${e})`;
    case "linear":
      return `linear-gradient(135deg, ${s}, ${e})`;
    case "radial":
      return `radial-gradient(circle, ${s}, ${e})`;
  }
}

const triplet = (rgb: Rgb) => rgb.join(" ");

export function applyThemeToDocument(theme: ThemeConfig): void {
  const style = document.documentElement.style;
  const setRamp = (name: "brand" | "accent", hex: string) => {
    const ramp = buildRamp(hex);
    for (const shade of SHADES) style.setProperty(`--${name}-${shade}`, triplet(ramp[shade]));
  };
  setRamp("brand", theme.primary);
  setRamp("accent", theme.secondary);
  style.setProperty("--brand-fill", fillValue(theme));
  for (const key of ROLE_KEYS) {
    style.setProperty(`--role-${key}`, triplet(hexToRgb(theme.roles[key].color)));
    style.setProperty(`--role-${key}-accent`, triplet(hexToRgb(theme.roles[key].accent)));
  }
}

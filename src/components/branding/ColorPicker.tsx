import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  contrastWithWhite, hexToRgb, hslToRgb, rgbToHex, rgbToHsl, type Rgb,
} from "@/lib/themeConfig";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const MIN_CONTRAST_WITH_WHITE = 3;

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  checkContrast?: boolean;
}

export function ColorPicker({ label, value, onChange, checkContrast = true }: ColorPickerProps) {
  const [hexText, setHexText] = useState(value);
  useEffect(() => {
    setHexText(value);
  }, [value]);

  const rgb = hexToRgb(value);
  const [h, s, l] = rgbToHsl(rgb);

  const setRgbChannel = (index: number, raw: string) => {
    const next = [...rgb] as Rgb;
    next[index] = Math.min(255, Math.max(0, Number.parseInt(raw, 10) || 0));
    onChange(rgbToHex(next));
  };

  const setHslChannel = (index: number, raw: string) => {
    const next: [number, number, number] = [h, s, l];
    next[index] = Math.min(index === 0 ? 360 : 100, Math.max(0, Number.parseInt(raw, 10) || 0));
    onChange(rgbToHex(hslToRgb(next)));
  };

  const commitHex = (text: string) => {
    setHexText(text);
    if (HEX_RE.test(text)) onChange(text.toLowerCase());
  };

  const tooLight = checkContrast && contrastWithWhite(value) < MIN_CONTRAST_WITH_WHITE;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} (spektrum warna)`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 flex-shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <input
            aria-label={`${label} kode HEX`}
            className="input mt-1 font-mono uppercase"
            value={hexText}
            maxLength={7}
            onChange={(e) => commitHex(e.target.value)}
            onBlur={() => setHexText(value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ChannelInput label="R" max={255} value={rgb[0]} onValue={(v) => setRgbChannel(0, v)} />
        <ChannelInput label="G" max={255} value={rgb[1]} onValue={(v) => setRgbChannel(1, v)} />
        <ChannelInput label="B" max={255} value={rgb[2]} onValue={(v) => setRgbChannel(2, v)} />
        <ChannelInput label="H" max={360} value={h} onValue={(v) => setHslChannel(0, v)} />
        <ChannelInput label="S%" max={100} value={s} onValue={(v) => setHslChannel(1, v)} />
        <ChannelInput label="L%" max={100} value={l} onValue={(v) => setHslChannel(2, v)} />
      </div>

      {tooLight && (
        <p className="flex items-center gap-1.5 text-xs text-warning-700">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Warna ini terlalu terang untuk teks putih. Pilih warna yang lebih gelap.
        </p>
      )}
    </div>
  );
}

function ChannelInput({ label, max, value, onValue }: { label: string; max: number; value: number; onValue: (raw: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
      <span className="w-6">{label}</span>
      <input
        type="number"
        aria-label={`Nilai ${label}`}
        min={0}
        max={max}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        className="w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none tabular-nums"
      />
    </label>
  );
}

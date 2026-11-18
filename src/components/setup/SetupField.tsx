import type { ReactNode } from "react";

interface SetupFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function SetupField({ label, htmlFor, error, hint, children }: SetupFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-error-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const setupInputClass =
  "input transition-all duration-300 focus:border-amber-500 focus:ring-amber-500/20";

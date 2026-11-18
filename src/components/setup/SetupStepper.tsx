import { Check, type LucideIcon } from "lucide-react";

export interface SetupStep {
  label: string;
  icon: LucideIcon;
}

interface SetupStepperProps {
  steps: SetupStep[];
  current: number;
}

export function SetupStepper({ steps, current }: SetupStepperProps) {
  return (
    <ol className="flex items-center" aria-label="Langkah setup">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = step.icon;
        return (
          <li key={step.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  done
                    ? "border-amber-600 bg-amber-600 text-white"
                    : active
                      ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                {done ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
              </span>
              <span
                className={`hidden text-sm font-semibold sm:inline transition-colors duration-300 ${
                  active ? "text-slate-800" : done ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                className={`mx-3 h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                  index < current ? "bg-amber-600" : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

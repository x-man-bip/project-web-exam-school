import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-brand-500" />;
}

export function FullPageLoader({ message = "Memuat..." }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
      <Spinner size={36} />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  color = "slate",
}: {
  children: ReactNode;
  color?: "slate" | "brand" | "success" | "warning" | "error" | "accent";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-100 text-brand-700",
    success: "bg-success-100 text-success-700",
    warning: "bg-warning-100 text-warning-700",
    error: "bg-error-100 text-error-700",
    accent: "bg-accent-100 text-accent-700",
  };
  return <span className={`badge ${colors[color]}`}>{children}</span>;
}

export function StatCard({
  label,
  value,
  icon,
  color = "brand",
  trend,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: "brand" | "accent" | "success" | "warning" | "error";
  trend?: string;
}) {
  const colors = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400",
    accent: "bg-accent-50 text-accent-600 dark:bg-accent-900/30 dark:text-accent-400",
    success: "bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400",
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400",
    error: "bg-error-50 text-error-600 dark:bg-error-900/30 dark:text-error-400",
  };
  return (
    <div className="card p-5 hover:shadow-cardHover transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {trend && <p className="mt-1 text-xs text-slate-400">{trend}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  type = "info",
}: {
  message: string;
  type?: "info" | "success" | "error";
}) {
  const colors = {
    info: "bg-brand-600",
    success: "bg-success-600",
    error: "bg-error-600",
  };
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`${colors[type]} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg`}>
        {message}
      </div>
    </div>
  );
}

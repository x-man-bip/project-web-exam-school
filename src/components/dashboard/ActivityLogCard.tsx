import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EmptyState, Spinner } from "@/components/ui";

const REFRESH_MS = 15000;

interface LogEntry {
  id: string;
  event_type: string;
  created_at: string;
}

function humanizeEvent(eventType: string): string {
  const text = eventType.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ActivityLogCard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: logError } = await supabase
        .from("audit_logs")
        .select("id, event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (cancelled) return;

      if (logError) {
        setError("Log aktivitas belum bisa dimuat.");
      } else {
        setLogs((data ?? []) as LogEntry[]);
        setError(null);
      }
      setLoading(false);
    };

    load();
    const refresh = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, []);

  return (
    <section className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <History size={20} className="text-brand-600" />
        <h2 className="text-lg font-semibold text-slate-800">Log Aktivitas Terbaru</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size={24} /></div>
      ) : error ? (
        <EmptyState icon={<History size={24} />} title="Gagal memuat" description={error} />
      ) : logs.length === 0 ? (
        <EmptyState icon={<History size={24} />} title="Belum ada aktivitas" description="Aktivitas sistem akan muncul di sini." />
      ) : (
        <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="text-slate-700">{humanizeEvent(log.event_type)}</span>
              <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                {new Date(log.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

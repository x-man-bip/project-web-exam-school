import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { FullPageLoader } from "@/components/ui";
import { SetupWizard } from "@/pages/SetupWizard";
import { useHashRoute, navigate } from "@/lib/router";
import { fetchSetupRequired } from "@/lib/setup";

type SetupStatus = "loading" | "required" | "complete" | "error";

export function SetupGate({ children }: { children: ReactNode }) {
  const [path] = useHashRoute();
  const [status, setStatus] = useState<SetupStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchSetupRequired()
      .then((required) => {
        if (active) setStatus(required ? "required" : "complete");
      })
      .catch((err) => {
        console.error("Setup status check failed", err);
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (status === "required" && path !== "/setup") navigate("/setup");
    if (status === "complete" && path === "/setup") navigate("/login");
  }, [status, path]);

  const finishSetup = useCallback(() => {
    setStatus("complete");
    navigate("/login");
  }, []);

  if (status === "loading") return <FullPageLoader />;

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto w-12 h-12 rounded-full bg-error-50 text-error-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-800">Tidak dapat memeriksa status sekolah</h2>
          <p className="mt-2 text-sm text-slate-500">Periksa koneksi internet Anda lalu coba lagi.</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="btn-primary mt-6 w-full"
          >
            <RefreshCw size={16} />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (path === "/setup") {
    return status === "required" ? <SetupWizard onFinish={finishSetup} /> : <FullPageLoader />;
  }

  if (status === "required") return <FullPageLoader />;

  return <>{children}</>;
}

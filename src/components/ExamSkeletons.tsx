export function ExamTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50/50">
              <th className="px-4 py-3 font-medium">Nama Ujian & Mapel</th>
              <th className="px-4 py-3 font-medium">Target Kelas</th>
              <th className="px-4 py-3 font-medium">Jadwal</th>
              <th className="px-4 py-3 font-medium">Durasi</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded bg-slate-200 animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-40 rounded bg-slate-200 animate-pulse" />
                      <div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5"><div className="h-5 w-20 rounded-full bg-slate-200 animate-pulse" /></td>
                <td className="px-4 py-3.5">
                  <div className="space-y-1.5">
                    <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
                    <div className="h-2.5 w-16 rounded bg-slate-100 animate-pulse" />
                  </div>
                </td>
                <td className="px-4 py-3.5"><div className="h-3 w-12 rounded bg-slate-200 animate-pulse" /></td>
                <td className="px-4 py-3.5"><div className="h-5 w-24 rounded-full bg-slate-200 animate-pulse" /></td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    <div className="h-7 w-7 rounded-lg bg-slate-200 animate-pulse" />
                    <div className="h-7 w-7 rounded-lg bg-slate-200 animate-pulse" />
                    <div className="h-7 w-7 rounded-lg bg-slate-200 animate-pulse" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExamCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="h-5 w-24 rounded-full bg-slate-200 animate-pulse" />
            <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
          </div>
          <div className="h-5 w-3/4 rounded bg-slate-200 animate-pulse" />
          <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
          <div className="flex gap-3 pt-3 border-t border-slate-100">
            <div className="h-7 w-24 rounded-lg bg-slate-200 animate-pulse" />
            <div className="h-7 w-24 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-7 w-7 rounded-lg bg-slate-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

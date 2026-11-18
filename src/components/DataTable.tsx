import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TABLE_PAGE_SIZES = [5, 10, 20];
export const TABLE_DEFAULT_PAGE_SIZE = 10;

/* Scroll box for tbody rows; the thead inside it stays pinned at top */
export const TABLE_SCROLL_CLASS = "overflow-auto max-h-[calc(100vh-340px)]";

export function usePagination<T>(items: T[], initialPageSize = TABLE_DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, total);
  const paged = useMemo(() => items.slice(start, end), [items, start, end]);
  return { paged, page: currentPage, setPage, pageSize, setPageSize, total, totalPages, start, end };
}

export function TablePagination({ total, page, totalPages, start, end, pageSize, noun, onPageChange, onPageSizeChange }: {
  total: number;
  page: number;
  totalPages: number;
  start: number;
  end: number;
  pageSize: number;
  noun: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (total === 0) return null;
  const visible = Array.from({ length: totalPages }, (_, i) => i)
    .filter((i) => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Menampilkan {start + 1}-{end} dari {total} {noun}</span>
        <select
          className="input w-auto py-1 text-xs"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Jumlah baris per halaman"
        >
          {TABLE_PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / halaman</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} /> Sebelumnya
        </button>
        {visible.map((i, idx) => (
          <span key={i} className="flex items-center">
            {idx > 0 && visible[idx - 1] !== i - 1 && <span className="px-1 text-xs text-slate-400">...</span>}
            <button
              type="button"
              onClick={() => onPageChange(i)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition ${i === page ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {i + 1}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Selanjutnya <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

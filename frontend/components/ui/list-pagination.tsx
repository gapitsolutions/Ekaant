"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Page navigation for server-paginated list tables. Shows the current window
 * ("X–Y of N") and prev/next controls. Pure/presentational — the parent owns
 * the page state and data fetching.
 */
export function ListPagination({
  page,
  pageSize,
  total,
  noun,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
      <p className="text-xs text-slate-400 font-medium">
        {total === 0
          ? `No ${noun}s`
          : `Showing ${from}–${to} of ${total} ${noun}${total === 1 ? "" : "s"}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 h-8"
            onClick={onPrev}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <span className="text-xs font-bold text-slate-500 tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 h-8"
            onClick={onNext}
            disabled={page >= totalPages}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

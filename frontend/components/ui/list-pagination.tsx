"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

/**
 * Page navigation for server-paginated list tables. Shows the current window
 * ("X–Y of N") and prev/next controls. Pure/presentational — the parent owns
 * the page state and data fetching.
 *
 * When ``onJump`` is supplied it also renders First/Last buttons and a
 * "go to page" number input (type a page → Enter/Go), clamped to the valid
 * range. Omitting ``onJump`` keeps the original prev/next-only layout.
 */
export function ListPagination({
  page,
  pageSize,
  total,
  noun,
  onPrev,
  onNext,
  onJump,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPrev: () => void;
  onNext: () => void;
  onJump?: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const [jump, setJump] = useState("");

  const submitJump = () => {
    if (!onJump) return;
    const n = parseInt(jump, 10);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(totalPages, Math.max(1, n));
    if (clamped !== page) onJump(clamped);
    setJump("");
  };

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
      <p className="text-xs text-slate-400 font-medium">
        {total === 0
          ? `No ${noun}s`
          : `Showing ${from}–${to} of ${total} ${noun}${total === 1 ? "" : "s"}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {onJump && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-slate-200 h-8 px-2"
              onClick={() => onJump(1)}
              disabled={page <= 1}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 h-8"
            onClick={onPrev}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>

          {onJump ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className="hidden sm:inline">Page</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={jump}
                onChange={(e) => setJump(e.target.value)}
                // Select existing text on focus so clicking the field and
                // typing replaces any stale value instead of appending to it.
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitJump();
                  }
                }}
                placeholder={String(page)}
                aria-label="Go to page"
                className="h-8 w-14 text-center tabular-nums px-1"
              />
              <span className="tabular-nums whitespace-nowrap">
                of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border-slate-200 h-8"
                onClick={submitJump}
                disabled={jump.trim() === ""}
              >
                Go
              </Button>
            </div>
          ) : (
            <span className="text-xs font-bold text-slate-500 tabular-nums">
              Page {page} of {totalPages}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-slate-200 h-8"
            onClick={onNext}
            disabled={page >= totalPages}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          {onJump && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-slate-200 h-8 px-2"
              onClick={() => onJump(totalPages)}
              disabled={page >= totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

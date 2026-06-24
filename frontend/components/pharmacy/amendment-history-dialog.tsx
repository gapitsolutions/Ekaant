"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, Pencil } from "lucide-react";
import type {
  DispenseAmendmentInfo,
  DispenseInvoicePreviousState,
} from "@/lib/pharmacy-api";

function inr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) || 0 : value;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders one ``previous_state`` snapshot as a read-only invoice card. */
function PreviousStateCard({
  state,
  label,
  amendedAt,
  amendedBy,
  reason,
}: {
  state: DispenseInvoicePreviousState;
  label: string;
  amendedAt: string;
  amendedBy: string;
  reason: string;
}) {
  const subtotal = parseFloat(state.subtotal) || 0;
  const discount = parseFloat(state.discount_amount) || 0;
  const consultation = parseFloat(state.consultation_fee) || 0;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{label}</span>
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700 font-semibold text-[10px]"
            >
              <Pencil className="h-3 w-3 mr-1" />
              Replaced {fmtDateTime(amendedAt)}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 break-words">
            Reason:{" "}
            <span className="font-medium text-slate-700">{reason}</span>
            {amendedBy ? ` · by ${amendedBy}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Net payable
          </p>
          <p className="text-base font-black text-slate-800 tracking-tight whitespace-nowrap">
            {inr(state.net_payable)}
          </p>
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 text-left font-bold">Medicine</th>
              <th className="px-2 py-2 text-center font-bold">Batch</th>
              <th className="px-2 py-2 text-right font-bold">Qty</th>
              <th className="px-2 py-2 text-right font-bold">Unit</th>
              <th className="px-4 py-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-slate-400"
                >
                  No line items in this version.
                </td>
              </tr>
            ) : (
              state.items.map((item, idx) => (
                <tr key={`${item.medicine_id}-${item.batch_number}-${idx}`}>
                  <td className="px-4 py-2 align-top">
                    <span className="font-semibold text-slate-700 block leading-tight">
                      {item.medicine_name}
                    </span>
                    {item.salt ? (
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {item.salt}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    <span className="inline-block rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 whitespace-nowrap">
                      {item.batch_number}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right align-top font-bold text-slate-700">
                    {item.quantity}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-slate-600 whitespace-nowrap">
                    {inr(item.unit_price)}
                  </td>
                  <td className="px-4 py-2 text-right align-top font-bold text-slate-800 whitespace-nowrap">
                    {inr(item.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 space-y-1">
        <div className="flex justify-between gap-4 text-xs text-slate-600">
          <span>Subtotal (medicines)</span>
          <span className="font-semibold text-slate-800 whitespace-nowrap">
            {inr(subtotal)}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between gap-4 text-xs text-emerald-700">
            <span>
              Discount
              {parseFloat(state.discount_percentage) > 0
                ? ` (${parseFloat(state.discount_percentage)}%)`
                : ""}
            </span>
            <span className="font-semibold whitespace-nowrap">
              -{inr(discount)}
            </span>
          </div>
        )}
        {consultation > 0 && (
          <div className="flex justify-between gap-4 text-xs text-slate-600">
            <span>Consultation fee</span>
            <span className="font-semibold text-slate-800 whitespace-nowrap">
              +{inr(consultation)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4 text-sm pt-1 mt-1 border-t border-slate-200">
          <span className="font-bold text-slate-700">Net payable</span>
          <span className="font-black text-slate-900 whitespace-nowrap">
            {inr(state.net_payable)}
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-xs text-slate-500 pt-0.5">
          <span className="whitespace-nowrap">
            Paid ({state.payment_method}) {inr(state.amount_paid)}
          </span>
          {state.notes ? (
            <span className="italic text-slate-400 break-words">
              {state.notes}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AmendmentHistoryDialog({
  open,
  onOpenChange,
  invoiceNumber,
  patientName,
  amendments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  patientName: string;
  amendments: DispenseAmendmentInfo[];
}) {
  // ``amendments`` arrive newest-first. The OLDEST amendment's snapshot is the
  // original invoice; the newest amendment's snapshot is the version right
  // before the latest edit. Label them by version number (oldest = v1).
  const total = amendments.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-4xl is required — the shadcn default sm:max-w-lg would
          otherwise override an un-prefixed max-w-* on desktop. min-w-0 on the
          inner wrapper lets the grid child shrink instead of overflowing. */}
      <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="truncate">
              Previous versions{invoiceNumber ? ` — ${invoiceNumber}` : ""}
            </span>
          </DialogTitle>
          <DialogDescription>
            {total === 0 ? (
              "This invoice has not been amended."
            ) : (
              <>
                <span className="font-semibold">{patientName}</span>
                {"’s"} invoice has been amended{" "}
                <span className="font-semibold">{total}</span> time
                {total === 1 ? "" : "s"}. Each card below is the invoice exactly
                as it was before that edit (newest first).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {total > 0 && (
          <div className="min-w-0 space-y-4">
            {amendments.map((amendment, idx) => {
              // Newest first → version number counts down from ``total``.
              const versionNo = total - idx;
              const isOriginal = idx === total - 1;
              return (
                <PreviousStateCard
                  key={`${amendment.amended_at}-${idx}`}
                  state={amendment.previous_state}
                  label={
                    isOriginal
                      ? "Original invoice (v1)"
                      : `Version ${versionNo}`
                  }
                  amendedAt={amendment.amended_at}
                  amendedBy={amendment.amended_by_name}
                  reason={amendment.reason}
                />
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

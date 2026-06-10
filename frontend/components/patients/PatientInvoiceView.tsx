"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Pill, Printer, Receipt, Loader2, XCircle } from "lucide-react";
import {
  getDispenseInvoiceBySession,
  type DispenseInvoiceDetail,
  type DispenseInvoiceLineItem,
} from "@/lib/pharmacy-api";
import { generateInvoicePdf } from "@/lib/export/generateInvoicePdf";

interface PatientInvoiceViewProps {
  /** The visit session UUID — used to fetch the dispense invoice */
  sessionId: string;
  /** Visit status — used to short-circuit fetch for cancelled visits */
  visitStatus: string;
  patientName: string;
  fileNumber: string;
  prefetchedInvoice?: DispenseInvoiceDetail | null;
}

function formatDate(date: string | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  Cash: "Cash",
  Online: "Online",
  Split: "Split (Cash + Online)",
};

export function PatientInvoiceView({
  sessionId,
  visitStatus,
  patientName,
  fileNumber,
  prefetchedInvoice = null,
}: PatientInvoiceViewProps) {
  const [invoice, setInvoice] = useState<DispenseInvoiceDetail | null>(
    prefetchedInvoice,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInvoice(prefetchedInvoice);
    setError(null);
  }, [prefetchedInvoice, sessionId]);

  // Lazy fetch — only when this component mounts (i.e., invoice expanded)
  useEffect(() => {
    if (prefetchedInvoice) return;
    if (visitStatus === "cancelled") return;

    setIsLoading(true);
    setError(null);
    getDispenseInvoiceBySession(sessionId)
      .then((data) => setInvoice(data))
      .catch(() => setError("no_invoice"))
      .finally(() => setIsLoading(false));
  }, [sessionId, visitStatus, prefetchedInvoice]);

  // Cancelled visit
  if (visitStatus === "cancelled") {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          <XCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Visit was cancelled.</p>
          <p className="text-sm mt-1">No dispensing invoice exists.</p>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Loading invoice...
        </div>
      </div>
    );
  }

  // No invoice found (visit in progress, or no pharmacy stage completed)
  if (error || !invoice) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">
            Invoice not available for this visit.
          </p>
          <p className="text-sm mt-1">
            Medicines have not been dispensed yet.
          </p>
        </div>
      </div>
    );
  }

  const subtotal = parseFloat(invoice.subtotal) || 0;
  const discountAmt = parseFloat(invoice.discount_amount) || 0;
  const discountPct = parseFloat(invoice.discount_percentage) || 0;
  const netPayable = parseFloat(invoice.net_payable) || 0;

  const handlePrintInvoice = () => {
    generateInvoicePdf({
      invoice,
      patientName,
      fileNumber,
    });
  };

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Receipt Top Header */}
      <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Receipt className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Patient Visit Invoice
            </h4>
            <p className="text-[10px] text-slate-400 font-mono font-bold mt-0.5">
              {invoice.invoice_number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(invoice.amendments?.length ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-[10px] font-bold"
              title={invoice.amendments[0]?.reason}
            >
              AMENDED{" "}
              {invoice.amendments.length > 1
                ? `×${invoice.amendments.length}`
                : ""}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={
              invoice.status === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100 px-2 py-0.5 text-[10px] font-bold"
                : "bg-red-50 text-red-700 border-red-100 px-2 py-0.5 text-[10px] font-bold"
            }
          >
            {invoice.status === "success" ? "PAID" : "CANCELLED"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrintInvoice}
            className="h-7 w-7 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
            title="Print Invoice"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Receipt Body */}
      <div className="p-5 space-y-4">
        {/* Info block */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
          <div>
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">
              Invoice Date
            </span>
            <p className="font-bold text-slate-700 font-mono mt-0.5">
              {formatDate(invoice.dispense_date)}
            </p>
          </div>
          <div>
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">
              Payment Mode
            </span>
            <p className="font-bold text-slate-700 capitalize mt-0.5">
              {PAYMENT_METHOD_LABELS[invoice.payment_method] ||
                invoice.payment_method}
            </p>
          </div>
          <div>
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">
              Patient Name
            </span>
            <p className="font-bold text-slate-800 mt-0.5">{patientName}</p>
          </div>
          <div>
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">
              File Number
            </span>
            <p className="font-bold text-slate-700 font-mono mt-0.5">
              {fileNumber}
            </p>
          </div>
        </div>

        <Separator className="border-dashed border-slate-200 my-1" />

        {/* Medicine Items Table */}
        {invoice.items.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Description</span>
              <div className="flex gap-8">
                <span className="w-16 text-center">Qty / Px</span>
                <span className="w-16 text-right">Amount</span>
              </div>
            </div>
            <div className="space-y-1 text-xs text-slate-700">
              {invoice.items.map((item) => (
                <MedicineRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        <Separator className="border-dashed border-slate-200 my-1" />

        {/* Cost Summary */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-500 font-medium">
            <span>Subtotal</span>
            <span className="font-mono text-slate-700 font-bold">
              {"₹"}
              {subtotal.toFixed(2)}
            </span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>
                Discount
                {discountPct > 0 ? ` (${discountPct}%)` : ""}
              </span>
              <span className="font-mono">
                -{"₹"}
                {discountAmt.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center bg-primary/5 p-3 rounded-xl border border-primary/10 mt-3 shadow-inner">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Total Visit Invoice
            </span>
            <span className="text-lg font-black text-primary font-mono">
              {"₹"}
              {netPayable.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Amendment history — newest first, matches API ordering */}
        {(invoice.amendments?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Amendment history
            </p>
            {invoice.amendments.map((a, idx) => (
              <p key={idx} className="text-[10px] text-amber-800">
                {new Date(a.amended_at).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                — {a.reason}
                {a.amended_by_name ? ` (${a.amended_by_name})` : ""}
              </p>
            ))}
          </div>
        )}

        {/* Pharmacist info */}
        {invoice.pharmacist && (
          <div className="text-[10px] text-slate-400 text-right">
            Dispensed by: <span className="font-medium">{invoice.pharmacist}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="pt-2 flex justify-end gap-2">
          <Button
            onClick={handlePrintInvoice}
            className="bg-primary hover:bg-primary-dark text-white font-bold text-xs h-8 px-4 rounded-lg flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Invoice Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}

function MedicineRow({ item }: { item: DispenseInvoiceLineItem }) {
  const unitPrice = parseFloat(item.unit_price) || 0;
  const total = parseFloat(item.total) || 0;

  return (
    <div className="flex justify-between items-center hover:bg-slate-50/50 p-1.5 rounded transition-colors">
      <div className="flex items-center gap-1.5 min-w-0">
        <Pill className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold text-slate-600 truncate">
          {item.medicine_name}
        </span>
      </div>
      <div className="flex gap-8 items-center font-mono shrink-0 font-medium">
        <span className="w-16 text-center text-slate-400">
          {item.quantity} {"×"} {"₹"}
          {unitPrice.toFixed(0)}
        </span>
        <span className="w-16 text-right font-bold text-slate-700">
          {"₹"}
          {total.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

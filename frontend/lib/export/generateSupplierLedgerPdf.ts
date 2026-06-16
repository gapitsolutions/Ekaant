import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  PAGE_MARGIN_X,
  INK,
  INK_SOFT,
  LIGHT,
  drawFootersOnAllPages,
  drawSectionTitle,
  drawKpiBand,
  drawTable,
  formatGeneratedAt,
  newPage,
  sanitiseFilenamePart,
  type TableColumn,
} from "./pdf-layout";

export interface SupplierLedgerPdfRow {
  date: string;
  entry_type: string;
  credit: string;
  debit: string;
  balance: string;
  payment_mode: string;
  reference: string;
  note: string;
  invoice_number: string;
}

export interface SupplierLedgerPdfData {
  supplier: {
    company_name: string;
    gst_number?: string | null;
    full_address?: string | null;
  };
  summary: { outstanding: string; total_invoiced: string; total_paid: string };
  rows: SupplierLedgerPdfRow[];
}

function rupees(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "Rs. 0.00";
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function rowDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function describe(r: SupplierLedgerPdfRow): string {
  if (r.entry_type === "invoice") return r.note || `Invoice ${r.invoice_number}`;
  const bits = [
    `Payment${r.payment_mode ? ` via ${r.payment_mode}` : ""}`,
    r.reference ? `Ref: ${r.reference}` : "",
    r.note || "",
  ].filter(Boolean);
  return bits.join(" · ");
}

/**
 * Supplier accounts-payable ledger PDF — built on the shared report layout
 * (same primitives as the pharmacy report / purchase-order PDFs), NOT a browser
 * print. Rows are passed already-ordered/filtered from the screen so the print
 * mirrors what the user sees.
 */
export async function generateSupplierLedgerPdf(
  data: SupplierLedgerPdfData,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Supplier Ledger");
  const { doc: d } = layout;

  drawSectionTitle(layout, data.supplier.company_name);

  // Sub-meta (GST / address).
  d.setFontSize(8);
  d.setFont("helvetica", "normal");
  d.setTextColor(INK_SOFT);
  const meta = [
    data.supplier.gst_number ? `GST: ${data.supplier.gst_number}` : "",
    data.supplier.full_address || "",
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) {
    d.text(meta, PAGE_MARGIN_X, layout.y);
    layout.y += 6;
  }

  drawKpiBand(layout, [
    { label: "Outstanding", value: rupees(data.summary.outstanding), accent: "#dc2626" },
    { label: "Total Invoiced", value: rupees(data.summary.total_invoiced), accent: INK },
    { label: "Total Paid", value: rupees(data.summary.total_paid), accent: "#059669" },
  ]);

  drawSectionTitle(layout, "Ledger Entries");
  const columns: TableColumn[] = [
    { header: "Date", width: 26 },
    { header: "Description", width: 80 },
    { header: "Debit (Paid)", width: 26, align: "right" },
    { header: "Credit (Inv.)", width: 26, align: "right" },
    { header: "Balance", width: 24, align: "right" },
  ];
  const rows = data.rows.map((r) => {
    const debit = parseFloat(r.debit) || 0;
    const credit = parseFloat(r.credit) || 0;
    return [
      rowDate(r.date),
      describe(r),
      debit > 0 ? rupees(debit) : "—",
      credit > 0 ? rupees(credit) : "—",
      rupees(r.balance),
    ];
  });
  drawTable(layout, columns, rows, { emptyMessage: "No ledger entries." });

  drawFootersOnAllPages(doc, formatGeneratedAt());
  downloadPdf(
    doc,
    `supplier-ledger-${sanitiseFilenamePart(data.supplier.company_name)}.pdf`,
  );
}

import { jsPDF } from "jspdf";
import {
  loadLogoBase64,
  addPdfHeader,
  openPdfForPrint,
  downloadPdf,
} from "./pdf-helpers";
import { HOSPITAL_PRIMARY_COLOR } from "./hospital-branding";
import type { DispenseInvoiceDetail } from "@/lib/pharmacy-api";

/**
 * jsPDF's built-in helvetica font does NOT contain the ₹ glyph (U+20B9).
 * Using ₹ directly causes digit corruption / spacing artifacts in the PDF.
 * We use "Rs." consistently — the standard prefix for Indian Rupees in
 * print documents.
 */
function rupees(amount: number, decimals: number = 2): string {
  return `Rs. ${amount.toFixed(decimals)}`;
}

function rupeesInt(amount: number): string {
  return `Rs. ${Math.round(amount)}`;
}

interface InvoicePdfOptions {
  invoice: DispenseInvoiceDetail;
  patientName: string;
  fileNumber: string;
  mode?: "print" | "download";
}

function fmtDate(d: string | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", {
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

export async function generateInvoicePdf(
  options: InvoicePdfOptions,
): Promise<void> {
  const { invoice, patientName, fileNumber, mode = "print" } = options;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = addPdfHeader(doc, logo, { subtitle: "Patient Visit Invoice" });

  // ── Invoice number + status ──
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#94a3b8");
  doc.text(`Invoice: ${invoice.invoice_number}`, 14, y);

  const statusText = invoice.status === "success" ? "PAID" : "CANCELLED";
  doc.setFont("helvetica", "bold");
  doc.setTextColor(invoice.status === "success" ? "#16a34a" : "#dc2626");
  doc.text(statusText, pageWidth - 14, y, { align: "right" });
  y += 8;

  // ── Patient / Invoice info grid ──
  const col2x = pageWidth / 2;

  // Row 1
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#94a3b8");
  doc.text("INVOICE DATE", 14, y);
  doc.text("PAYMENT MODE", col2x, y);
  y += 4;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1e293b");
  doc.text(fmtDate(invoice.dispense_date), 14, y);
  doc.text(
    PAYMENT_METHOD_LABELS[invoice.payment_method] || invoice.payment_method,
    col2x,
    y,
  );
  y += 8;

  // Row 2
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#94a3b8");
  doc.text("PATIENT NAME", 14, y);
  doc.text("FILE NUMBER", col2x, y);
  y += 4;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1e293b");
  doc.text(patientName, 14, y);
  doc.text(fileNumber, col2x, y);
  y += 10;

  // ── Separator ──
  doc.setDrawColor("#e2e8f0");
  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  // ── Medicine table ──
  if (invoice.items.length > 0) {
    // Column positions
    const colMed = 14;
    const colQty = 120;
    const colAmt = pageWidth - 14;

    // Header
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#94a3b8");
    doc.text("DESCRIPTION", colMed, y);
    doc.text("QTY / PRICE", colQty, y);
    doc.text("AMOUNT", colAmt, y, { align: "right" });
    y += 2;
    doc.setDrawColor("#f1f5f9");
    doc.setLineWidth(0.2);
    doc.line(colMed, y, colAmt, y);
    y += 4;

    // Line items
    for (const item of invoice.items) {
      const unitPrice = parseFloat(item.unit_price) || 0;
      const total = parseFloat(item.total) || 0;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#475569");
      doc.text(item.medicine_name, colMed, y);

      doc.setFontSize(8);
      doc.setTextColor("#94a3b8");
      doc.text(`${item.quantity} x ${rupeesInt(unitPrice)}`, colQty, y);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#1e293b");
      doc.text(rupeesInt(total), colAmt, y, { align: "right" });
      y += 6;
    }

    y += 2;
    doc.setDrawColor("#e2e8f0");
    doc.setLineWidth(0.3);
    doc.line(14, y, colAmt, y);
    y += 6;
  }

  // ── Totals ──
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const discountAmt = parseFloat(invoice.discount_amount) || 0;
  const discountPct = parseFloat(invoice.discount_percentage) || 0;
  const netPayable = parseFloat(invoice.net_payable) || 0;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#64748b");
  doc.text("Subtotal", 14, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1e293b");
  doc.text(rupees(subtotal), pageWidth - 14, y, { align: "right" });
  y += 6;

  if (discountAmt > 0) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#16a34a");
    doc.text(
      `Discount${discountPct > 0 ? ` (${discountPct}%)` : ""}`,
      14,
      y,
    );
    doc.text(`-${rupees(discountAmt)}`, pageWidth - 14, y, {
      align: "right",
    });
    y += 6;
  }

  // ── Grand total box ──
  y += 2;
  doc.setFillColor("#f0fdfa");
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y - 1, pageWidth - 28, 12, 2, 2, "FD");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#334155");
  doc.text("TOTAL VISIT INVOICE", 18, y + 6);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
  doc.text(rupees(netPayable), pageWidth - 18, y + 6, { align: "right" });
  y += 18;

  // ── Pharmacist ──
  if (invoice.pharmacist) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor("#94a3b8");
    doc.text(`Dispensed by: ${invoice.pharmacist}`, 14, y);
    y += 5;
  }

  // ── Footer ──
  y += 5;
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor("#94a3b8");
  doc.text(
    `Generated on ${new Date().toLocaleString("en-IN")}`,
    14,
    y,
  );

  const filename = `invoice-${invoice.invoice_number}.pdf`;
  if (mode === "download") {
    downloadPdf(doc, filename);
    return;
  }
  openPdfForPrint(doc, filename);
}

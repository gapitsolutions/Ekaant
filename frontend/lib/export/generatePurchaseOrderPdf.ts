import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  PAGE_MARGIN_X,
  INK,
  INK_SOFT,
  LIGHT,
  drawFootersOnAllPages,
  drawSectionTitle,
  drawTable,
  formatGeneratedAt,
  newPage,
  sanitiseFilenamePart,
  type TableColumn,
} from "./pdf-layout";

export interface PurchaseOrderPdfItem {
  name: string;
  quantity: number;
  price: number;
  gstPercentage: number;
}

export interface PurchaseOrderPdfData {
  orderNumber: string;
  orderDate: string;
  expectedDate: string;
  paymentTerms: string;
  dispatchMethod: string;
  supplier: {
    company_name: string;
    contact_person?: string | null;
    mobile_number?: string | null;
    email?: string | null;
    full_address?: string | null;
    gst_number?: string | null;
  };
  items: PurchaseOrderPdfItem[];
}

function rupees(value: number): string {
  if (Number.isNaN(value)) return "Rs. 0";
  return `Rs. ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Client-side Purchase Order PDF. Purchase orders are intentionally NOT
 * persisted — they're a printable artifact generated on demand (a mistaken PO
 * is simply regenerated; the authoritative records are the purchase invoice +
 * payable ledger once goods arrive). See the supplier-console design notes.
 */
export async function generatePurchaseOrderPdf(
  data: PurchaseOrderPdfData,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Purchase Order");

  // ── Order + supplier meta ──
  drawSectionTitle(layout, `Purchase Order ${data.orderNumber}`);
  const { doc: d } = layout;

  const colGap = 6;
  const colW = (layout.contentWidth - colGap) / 2;
  const leftX = PAGE_MARGIN_X;
  const rightX = PAGE_MARGIN_X + colW + colGap;
  const top = layout.y;

  const metaLine = (label: string, value: string, x: number, y: number) => {
    d.setFontSize(7);
    d.setFont("helvetica", "bold");
    d.setTextColor(LIGHT);
    d.text(label.toUpperCase(), x, y);
    d.setFontSize(9);
    d.setFont("helvetica", "normal");
    d.setTextColor(INK);
    d.text(value || "—", x, y + 4);
  };

  // Left column — vendor.
  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(INK_SOFT);
  d.text("VENDOR", leftX, top);
  metaLine("Company", data.supplier.company_name, leftX, top + 6);
  metaLine("Contact", data.supplier.contact_person || "—", leftX, top + 16);
  metaLine("Phone", data.supplier.mobile_number || "—", leftX, top + 26);
  metaLine("GST", data.supplier.gst_number || "—", leftX, top + 36);

  // Right column — order terms.
  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(INK_SOFT);
  d.text("ORDER DETAILS", rightX, top);
  metaLine("Order Date", data.orderDate || "—", rightX, top + 6);
  metaLine("Expected Delivery", data.expectedDate || "—", rightX, top + 16);
  metaLine("Payment Terms", data.paymentTerms || "—", rightX, top + 26);
  metaLine("Dispatch Via", data.dispatchMethod || "—", rightX, top + 36);

  layout.y = top + 48;

  // ── Order lines ──
  drawSectionTitle(layout, "Order Lines");
  const columns: TableColumn[] = [
    { header: "Sr.", width: 12 },
    { header: "Item", width: 70 },
    { header: "Qty", width: 20, align: "right" },
    { header: "Unit Price", width: 28, align: "right" },
    { header: "GST%", width: 18, align: "right" },
    { header: "Total", width: 34, align: "right" },
  ];

  let grandTotal = 0;
  const rows = data.items.map((item, idx) => {
    const base = item.quantity * item.price;
    const total = base + base * (item.gstPercentage / 100);
    grandTotal += total;
    return [
      String(idx + 1),
      item.name,
      String(item.quantity),
      rupees(item.price),
      `${item.gstPercentage}%`,
      rupees(total),
    ];
  });

  drawTable(layout, columns, rows, {
    emptyMessage: "No items selected.",
    totalRow: ["", "Grand Total", "", "", "", rupees(grandTotal)],
  });

  drawFootersOnAllPages(doc, formatGeneratedAt());
  downloadPdf(
    doc,
    `purchase-order-${sanitiseFilenamePart(data.orderNumber || "draft")}.pdf`,
  );
}

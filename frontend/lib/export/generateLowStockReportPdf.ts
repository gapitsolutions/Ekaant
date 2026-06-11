import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  drawFootersOnAllPages,
  drawSectionTitle,
  drawTable,
  formatGeneratedAt,
  newPage,
  type TableColumn,
} from "./pdf-layout";
import type { LowStockReportItem } from "@/lib/pharmacy-api";

export async function generateLowStockReportPdf(
  items: LowStockReportItem[],
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Pharmacy Low Stock Report");

  drawSectionTitle(layout, `Medicines at or below reorder level: ${items.length}`);

  const columns: TableColumn[] = [
    { header: "Sr.", width: 14 },
    { header: "Medicine", width: 56 },
    { header: "Salt", width: 46 },
    { header: "Category", width: 22 },
    { header: "Remaining", width: 22, align: "right" },
    { header: "Reorder Level", width: 22, align: "right" },
  ];
  const rows = items.map((it, idx) => [
    String(idx + 1),
    it.name,
    it.salt,
    it.category,
    String(it.current_stock),
    String(it.reorder_level),
  ]);
  drawTable(layout, columns, rows, {
    emptyMessage: "All medicines are above their reorder level.",
  });

  drawFootersOnAllPages(doc, formatGeneratedAt());
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdf(doc, `pharmacy-low-stock-${stamp}.pdf`);
}

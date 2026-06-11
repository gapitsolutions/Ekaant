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
import type {
  ExpiryReportResponse,
  ExpiryReportRow,
} from "@/lib/pharmacy-api";

function fmtRowDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const COLUMNS_EXPIRED: TableColumn[] = [
  { header: "Sr.", width: 14 },
  { header: "Medicine", width: 60 },
  { header: "Batch No.", width: 34 },
  { header: "Expiry Date", width: 30 },
  { header: "Days Overdue", width: 22, align: "right" },
  { header: "Qty", width: 22, align: "right" },
];
const COLUMNS_NEAR: TableColumn[] = [
  { header: "Sr.", width: 14 },
  { header: "Medicine", width: 60 },
  { header: "Batch No.", width: 34 },
  { header: "Expiry Date", width: 30 },
  { header: "Days Remaining", width: 22, align: "right" },
  { header: "Qty", width: 22, align: "right" },
];

function expiredRows(rows: ExpiryReportRow[]): string[][] {
  return rows.map((r, idx) => [
    String(idx + 1),
    r.medicine_name,
    r.batch_number,
    fmtRowDate(r.expiry_date),
    r.days_overdue !== undefined ? String(r.days_overdue) : "—",
    String(r.quantity),
  ]);
}

function nearRows(rows: ExpiryReportRow[]): string[][] {
  return rows.map((r, idx) => [
    String(idx + 1),
    r.medicine_name,
    r.batch_number,
    fmtRowDate(r.expiry_date),
    r.days_until_expiry !== undefined ? String(r.days_until_expiry) : "—",
    String(r.quantity),
  ]);
}

export async function generateExpiryReportPdf(
  data: ExpiryReportResponse,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Pharmacy Expiry Report");

  drawSectionTitle(
    layout,
    `Expired: ${data.expired.length}   ·   Near Expiry: ${data.near_expiry.length}`,
  );

  drawSectionTitle(layout, "Expired Medicines");
  drawTable(layout, COLUMNS_EXPIRED, expiredRows(data.expired), {
    emptyMessage: "No expired batches in active inventory.",
  });

  drawSectionTitle(layout, "Near Expiry (within 180 days)");
  drawTable(layout, COLUMNS_NEAR, nearRows(data.near_expiry), {
    emptyMessage: "No batches nearing expiry.",
  });

  drawFootersOnAllPages(doc, formatGeneratedAt());
  const stamp = new Date().toISOString().slice(0, 10);
  downloadPdf(doc, `pharmacy-expiry-${stamp}.pdf`);
}

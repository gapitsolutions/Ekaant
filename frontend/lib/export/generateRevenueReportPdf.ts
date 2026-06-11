import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  drawFootersOnAllPages,
  drawKpiBand,
  drawSectionTitle,
  drawTable,
  formatGeneratedAt,
  newPage,
  sanitiseFilenamePart,
  type TableColumn,
} from "./pdf-layout";
import type { RevenueReportResponse } from "@/lib/pharmacy-api";

function rupees(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtRowDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export async function generateRevenueReportPdf(
  data: RevenueReportResponse,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Pharmacy Revenue Report");

  // Period chip line.
  drawSectionTitle(layout, `Period: ${data.period}`);

  // KPI band — 4 cards in one row, mirrors the on-screen summary.
  drawKpiBand(layout, [
    {
      label: "Total Revenue",
      value: rupees(data.summary.total_revenue),
      accent: "#0d7377",
    },
    { label: "Cash Sales", value: rupees(data.summary.total_cash), accent: "#b45309" },
    { label: "Online Sales", value: rupees(data.summary.total_online), accent: "#1d4ed8" },
    {
      label: "Transactions",
      value: String(data.summary.total_transactions),
      accent: "#6d28d9",
    },
  ]);

  // Breakdown table.
  drawSectionTitle(layout, "Revenue Breakdown");
  const columns: TableColumn[] = [
    { header: "Sr.", width: 14 },
    { header: "Date", width: 32 },
    { header: "Day", width: 26 },
    { header: "Cash", width: 28, align: "right" },
    { header: "Online", width: 28, align: "right" },
    { header: "Revenue", width: 32, align: "right" },
    { header: "Txns", width: 22, align: "right" },
  ];
  const rows = data.breakdown.map((row, idx) => [
    String(idx + 1),
    fmtRowDate(row.date),
    row.day_name,
    rupees(row.cash),
    rupees(row.online),
    rupees(row.revenue),
    String(row.transactions),
  ]);
  drawTable(layout, columns, rows, {
    emptyMessage: "No transactions in this period.",
    totalRow: [
      "",
      "Total",
      "",
      rupees(data.summary.total_cash),
      rupees(data.summary.total_online),
      rupees(data.summary.total_revenue),
      String(data.summary.total_transactions),
    ],
  });

  drawFootersOnAllPages(doc, formatGeneratedAt());
  downloadPdf(
    doc,
    `pharmacy-revenue-${sanitiseFilenamePart(data.period)}.pdf`,
  );
}

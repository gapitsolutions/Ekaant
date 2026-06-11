import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  drawFootersOnAllPages,
  drawSectionTitle,
  drawTable,
  formatGeneratedAt,
  newPage,
  sanitiseFilenamePart,
  type TableColumn,
} from "./pdf-layout";
import type {
  ConsumptionMedicineRow,
  ConsumptionReportResponse,
  MedicineCategory,
} from "@/lib/pharmacy-api";

function rupees(value: string): string {
  const num = parseFloat(value);
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

const BREAKDOWN_COLUMNS: TableColumn[] = [
  { header: "Sr.", width: 14 },
  { header: "Medicine", width: 64 },
  { header: "Salt", width: 50 },
  { header: "Consumed", width: 26, align: "right" },
  { header: "Selling Value", width: 28, align: "right" },
];

function breakdownRows(rows: ConsumptionMedicineRow[]): string[][] {
  return rows.map((r, idx) => [
    String(idx + 1),
    r.name,
    r.salt,
    String(r.quantity),
    rupees(r.selling_value),
  ]);
}

function breakdownTotals(rows: ConsumptionMedicineRow[]): string[] {
  const qty = rows.reduce((s, r) => s + r.quantity, 0);
  const value = rows.reduce(
    (s, r) => s + (parseFloat(r.selling_value) || 0),
    0,
  );
  return [
    "",
    "Totals",
    "",
    String(qty),
    `Rs. ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
  ];
}

export async function generateConsumptionReportPdf(
  data: ConsumptionReportResponse,
  category: "All" | MedicineCategory,
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const layout = newPage(doc, logo, "Pharmacy Consumption Report");

  drawSectionTitle(
    layout,
    `Period: ${data.period}  /  Category: ${category}`,
  );

  // Daily dispensing trend — table form (PDFs don't need a bar chart).
  // Only render when there are ≥2 data points; a single day has no trend.
  if (data.trend_data.length >= 2) {
    drawSectionTitle(layout, "Daily Dispensing Trend");
    const trendCols: TableColumn[] = [
      { header: "Date", width: 36 },
      { header: "Day", width: 30 },
      { header: "Rx", width: 28, align: "right" },
      { header: "NRx", width: 28, align: "right" },
      { header: "BUP", width: 28, align: "right" },
      { header: "Total", width: 32, align: "right" },
    ];
    const trendRows = data.trend_data.map((r) => [
      fmtRowDate(r.date),
      r.day_name,
      String(r.rx),
      String(r.nrx),
      String(r.bup),
      String(r.total),
    ]);
    drawTable(layout, trendCols, trendRows);
  }

  // Breakdown — grouped by BUP strength when category=BUP.
  if (category === "BUP") {
    const groups: Record<string, ConsumptionMedicineRow[]> = {
      "0.4mg + 0.1mg": [],
      "1.0mg + 0.25mg": [],
      "2.0mg + 0.5mg": [],
    };
    for (const m of data.medicine_breakdown) {
      if (m.strength && groups[m.strength]) {
        groups[m.strength].push(m);
      }
    }
    for (const [strength, rows] of Object.entries(groups)) {
      drawSectionTitle(layout, `BUP ${strength}  (${rows.length})`);
      drawTable(layout, BREAKDOWN_COLUMNS, breakdownRows(rows), {
        emptyMessage: "No consumption in this strength.",
        totalRow: rows.length > 0 ? breakdownTotals(rows) : undefined,
      });
    }
  } else {
    drawSectionTitle(layout, "Medicine Breakdown");
    drawTable(
      layout,
      BREAKDOWN_COLUMNS,
      breakdownRows(data.medicine_breakdown),
      {
        emptyMessage: "No consumption in this period.",
        totalRow:
          data.medicine_breakdown.length > 0
            ? breakdownTotals(data.medicine_breakdown)
            : undefined,
      },
    );
  }

  drawFootersOnAllPages(doc, formatGeneratedAt());
  downloadPdf(
    doc,
    `pharmacy-consumption-${sanitiseFilenamePart(data.period)}-${sanitiseFilenamePart(category)}.pdf`,
  );
}

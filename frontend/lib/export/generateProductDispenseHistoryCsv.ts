import type { Medicine, ProductDispenseHistoryItem } from "@/lib/pharmacy-api";

/**
 * Column-selectable CSV export for a medicine's dispense history.
 *
 * The page renders a checkbox per ``PRODUCT_DISPENSE_HISTORY_COLUMNS`` entry
 * (pre-ticked where ``default`` is true) and passes the chosen keys to
 * ``generateProductDispenseHistoryCsv`` — so the exported file contains
 * exactly the fields the user selected, in this canonical order.
 *
 * Conventions match the other CSV exports (see generatePatientProfileCsv):
 * UTF-8 BOM for Excel, ``\r\n`` line endings, RFC-4180 cell escaping.
 */

export type ProductDispenseHistoryColumnKey =
  | "date"
  | "time"
  | "patient_name"
  | "file_number"
  | "batch_number"
  | "expiry_date"
  | "quantity"
  | "unit_price"
  | "total_price"
  | "medicine_name"
  | "salt"
  | "category";

interface ColumnDef {
  key: ProductDispenseHistoryColumnKey;
  label: string;
  /** Pre-selected in the export picker. */
  default: boolean;
  accessor: (
    item: ProductDispenseHistoryItem,
    medicine: Medicine | null,
  ) => string | number;
}

function fmtDate(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function unitPrice(item: ProductDispenseHistoryItem): string {
  const total = parseFloat(item.total_price) || 0;
  if (!item.quantity) return "";
  return (total / item.quantity).toFixed(2);
}

// Canonical column order. The export always emits selected columns in this
// sequence regardless of the order the user toggled them.
export const PRODUCT_DISPENSE_HISTORY_COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", default: true, accessor: (i) => fmtDate(i.dispense_time) },
  { key: "time", label: "Time", default: true, accessor: (i) => fmtTime(i.dispense_time) },
  { key: "patient_name", label: "Patient Name", default: true, accessor: (i) => i.patient_name },
  { key: "file_number", label: "File Number", default: true, accessor: (i) => i.file_number || "" },
  { key: "batch_number", label: "Batch Number", default: true, accessor: (i) => i.batch_number },
  { key: "expiry_date", label: "Expiry Date", default: true, accessor: (i) => fmtDate(i.expiry_date) },
  { key: "quantity", label: "Quantity", default: true, accessor: (i) => i.quantity },
  { key: "unit_price", label: "Unit Price", default: false, accessor: (i) => unitPrice(i) },
  { key: "total_price", label: "Total Price", default: true, accessor: (i) => i.total_price },
  { key: "medicine_name", label: "Medicine", default: false, accessor: (_i, m) => m?.name || "" },
  { key: "salt", label: "Salt", default: false, accessor: (_i, m) => m?.salt || "" },
  { key: "category", label: "Category", default: false, accessor: (_i, m) => m?.category || "" },
];

export const DEFAULT_DISPENSE_HISTORY_COLUMNS: ProductDispenseHistoryColumnKey[] =
  PRODUCT_DISPENSE_HISTORY_COLUMNS.filter((c) => c.default).map((c) => c.key);

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateProductDispenseHistoryCsv(
  items: ProductDispenseHistoryItem[],
  medicine: Medicine | null,
  selectedKeys: ProductDispenseHistoryColumnKey[],
  filenameBase?: string,
): void {
  // Preserve canonical column order; ignore unknown/duplicate keys.
  const selected = new Set(selectedKeys);
  const columns = PRODUCT_DISPENSE_HISTORY_COLUMNS.filter((c) =>
    selected.has(c.key),
  );
  if (columns.length === 0) return;

  const lines = [
    columns.map((c) => escapeCsvCell(c.label)).join(","),
    ...items.map((item) =>
      columns.map((c) => escapeCsvCell(c.accessor(item, medicine))).join(","),
    ),
  ];
  const csv = lines.join("\r\n");

  // BOM keeps Excel happy with UTF-8 (Devanagari names, accents).
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const base = (filenameBase || medicine?.name || "medicine")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  link.setAttribute("href", url);
  link.setAttribute("download", `${base || "medicine"}_dispense_history.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

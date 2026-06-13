// CSV import/template helpers for bulk medicine registration.
//
// The codebase has no CSV library (exports are hand-rolled via escapeCsvCell),
// so parsing is hand-rolled here too — but with a correct state machine that
// handles quoted fields, escaped quotes ("") and embedded commas/newlines.
//
// Columns mirror the backend ``MedicineWriteSerializer`` field names exactly
// (snake_case) so the CSV round-trips cleanly and the server applies the same
// validation. The relational ``suppliers`` field is deliberately excluded —
// it expects Supplier UUIDs and has no name-based import mapping; medicines
// are linked to suppliers afterwards via the Edit dialog.

import {
  BUP_STRENGTHS,
  type BupStrength,
  type MedicineCategory,
} from "@/lib/pharmacy-api";

export const MEDICINE_CATEGORIES: MedicineCategory[] = ["BUP", "Rx", "NRx"];

export interface MedicineCsvColumn {
  key: string;
  label: string;
  required: boolean;
}

// Order here is the canonical column order for the template + review grid.
export const MEDICINE_CSV_COLUMNS: MedicineCsvColumn[] = [
  { key: "name", label: "Name", required: true },
  { key: "salt", label: "Salt / Generic Name", required: true },
  { key: "category", label: "Category", required: true },
  { key: "bup_category", label: "BUP Strength", required: false },
  { key: "manufacturer", label: "Manufacturer", required: true },
  { key: "reorder_level", label: "Reorder Level", required: false },
  { key: "tablets_per_strip", label: "Tablets/Strip", required: false },
  { key: "mrp", label: "MRP", required: true },
  { key: "selling_price", label: "Selling Price", required: true },
];

export const MEDICINE_CSV_HEADERS = MEDICINE_CSV_COLUMNS.map((c) => c.key);

const DEFAULT_REORDER_LEVEL = 50;
const DEFAULT_TABLETS_PER_STRIP = 10;

// ── Parsed-row shape used by the review grid (all strings; the user edits
// them inline before submission). ``row_number`` is the 1-based CSV data row.
export interface MedicineCsvRow {
  row_number: number;
  name: string;
  salt: string;
  category: string;
  bup_category: string;
  manufacturer: string;
  reorder_level: string;
  tablets_per_strip: string;
  mrp: string;
  selling_price: string;
}

export interface ParsedMedicineCsv {
  rows: MedicineCsvRow[];
  /** Header-level problems (missing/unknown columns). Non-empty ⇒ unusable. */
  headerErrors: string[];
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build and download a sample template generated from the actual importable
 * model fields, with two example rows (one NRx, one BUP).
 */
export function downloadMedicineCsvTemplate(): void {
  const header = MEDICINE_CSV_HEADERS.join(",");
  const sampleRows: (string | number)[][] = [
    ["Paracetamol 500mg", "Paracetamol", "NRx", "", "Cipla", 50, 10, "20.00", "18.00"],
    [
      "Buprenorphine + Naloxone",
      "Buprenorphine + Naloxone",
      "BUP",
      "2.0mg + 0.5mg",
      "Rusan",
      30,
      10,
      "120.00",
      "110.00",
    ],
  ];
  const csv = [
    header,
    ...sampleRows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");

  // BOM keeps Excel happy with UTF-8.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "medicine-import-template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse raw CSV text into a matrix of cells. Correctly handles quoted fields
 * containing commas, escaped quotes ("") and embedded newlines, plus CRLF/LF.
 */
function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip a leading BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Handle CRLF and lone CR as one line break.
      pushRow();
      if (text[i + 1] === "\n") i += 1;
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  // Flush trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

/**
 * Parse a medicine CSV file's text into review rows + header validation.
 * Header matching is case-insensitive and tolerant of surrounding whitespace.
 */
export function parseMedicineCsv(text: string): ParsedMedicineCsv {
  const matrix = parseCsvMatrix(text).filter(
    // Drop fully blank lines (e.g. trailing newline rows).
    (cells) => cells.some((c) => c.trim() !== ""),
  );

  if (matrix.length === 0) {
    return { rows: [], headerErrors: ["The file is empty."] };
  }

  const rawHeaders = matrix[0].map((h) => h.trim().toLowerCase());
  const headerErrors: string[] = [];

  const missing = MEDICINE_CSV_COLUMNS.filter(
    (c) => c.required && !rawHeaders.includes(c.key),
  ).map((c) => c.key);
  if (missing.length > 0) {
    headerErrors.push(`Missing required column(s): ${missing.join(", ")}.`);
  }

  const known = new Set(MEDICINE_CSV_HEADERS);
  const unknown = rawHeaders.filter((h) => h !== "" && !known.has(h));
  if (unknown.length > 0) {
    headerErrors.push(`Unknown column(s) ignored: ${unknown.join(", ")}.`);
  }

  // Map each expected key to its column index (or -1 if absent → blank).
  const colIndex: Record<string, number> = {};
  for (const key of MEDICINE_CSV_HEADERS) {
    colIndex[key] = rawHeaders.indexOf(key);
  }

  const cellAt = (cells: string[], key: string): string => {
    const idx = colIndex[key];
    if (idx < 0 || idx >= cells.length) return "";
    return (cells[idx] ?? "").trim();
  };

  const rows: MedicineCsvRow[] = matrix.slice(1).map((cells, i) => ({
    row_number: i + 1,
    name: cellAt(cells, "name"),
    salt: cellAt(cells, "salt"),
    category: cellAt(cells, "category"),
    bup_category: cellAt(cells, "bup_category"),
    manufacturer: cellAt(cells, "manufacturer"),
    reorder_level: cellAt(cells, "reorder_level"),
    tablets_per_strip: cellAt(cells, "tablets_per_strip"),
    mrp: cellAt(cells, "mrp"),
    selling_price: cellAt(cells, "selling_price"),
  }));

  return { rows, headerErrors };
}

// ── Per-row validation (mirrors the backend MedicineWriteSerializer rules so
// the user fixes problems before submitting). Returns a map of field → message
// plus a non-field message list.

export interface RowValidation {
  fieldErrors: Partial<Record<keyof MedicineCsvRow, string>>;
  generalErrors: string[];
}

/**
 * Resolve a free-text CSV category to the canonical enum value, matching
 * case-insensitively. ``rx`` / ``RX`` / ``Rx`` → ``"Rx"``; ``nrx`` / ``NRX``
 * → ``"NRx"``; ``bup`` → ``"BUP"``. Exported so the review grid maps the
 * parsed value to the same canonical enum the backend stores.
 */
export function normalizeCategory(value: string): MedicineCategory | null {
  const match = MEDICINE_CATEGORIES.find(
    (c) => c.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? null;
}

function normalizeBupStrength(value: string): BupStrength | null {
  const match = BUP_STRENGTHS.find(
    (s) => s.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? null;
}

export function validateMedicineRow(row: MedicineCsvRow): RowValidation {
  const fieldErrors: RowValidation["fieldErrors"] = {};
  const generalErrors: string[] = [];

  if (!row.name.trim()) fieldErrors.name = "Name is required.";
  if (!row.salt.trim()) fieldErrors.salt = "Salt / generic name is required.";
  if (!row.manufacturer.trim()) {
    fieldErrors.manufacturer = "Manufacturer is required.";
  }

  const category = normalizeCategory(row.category);
  if (!row.category.trim()) {
    fieldErrors.category = "Category is required.";
  } else if (!category) {
    fieldErrors.category = `Invalid category (use ${MEDICINE_CATEGORIES.join(" / ")}).`;
  }

  const bup = row.bup_category.trim();
  if (category === "BUP") {
    if (!bup) {
      fieldErrors.bup_category = "BUP medicines require a strength.";
    } else if (!normalizeBupStrength(bup)) {
      fieldErrors.bup_category = `Invalid strength (use ${BUP_STRENGTHS.join(" / ")}).`;
    }
  } else if (category && bup) {
    fieldErrors.bup_category = "Only BUP medicines may have a strength.";
  }

  // Integers (optional → defaulted; if present must be valid non-negative).
  if (row.reorder_level.trim()) {
    const n = Number(row.reorder_level);
    if (!Number.isInteger(n) || n < 0) {
      fieldErrors.reorder_level = "Must be a whole number ≥ 0.";
    }
  }
  if (row.tablets_per_strip.trim()) {
    const n = Number(row.tablets_per_strip);
    if (!Number.isInteger(n) || n < 1) {
      fieldErrors.tablets_per_strip = "Must be a whole number ≥ 1.";
    }
  }

  const mrp = Number(row.mrp);
  const selling = Number(row.selling_price);
  if (!row.mrp.trim()) {
    fieldErrors.mrp = "MRP is required.";
  } else if (Number.isNaN(mrp) || mrp < 0) {
    fieldErrors.mrp = "MRP must be a valid number ≥ 0.";
  }
  if (!row.selling_price.trim()) {
    fieldErrors.selling_price = "Selling price is required.";
  } else if (Number.isNaN(selling) || selling < 0) {
    fieldErrors.selling_price = "Selling price must be a valid number ≥ 0.";
  }
  if (
    !fieldErrors.mrp &&
    !fieldErrors.selling_price &&
    !Number.isNaN(mrp) &&
    !Number.isNaN(selling) &&
    selling > mrp
  ) {
    fieldErrors.selling_price = "Selling price cannot exceed MRP.";
  }

  return { fieldErrors, generalErrors };
}

export function rowHasErrors(v: RowValidation): boolean {
  return Object.keys(v.fieldErrors).length > 0 || v.generalErrors.length > 0;
}

/**
 * Build the backend payload for one validated row. Applies the same defaults
 * the single-add form uses for the optional integer fields.
 */
export function rowToPayload(row: MedicineCsvRow): Record<string, unknown> {
  const category = normalizeCategory(row.category);
  const bup =
    category === "BUP" ? normalizeBupStrength(row.bup_category) : null;
  return {
    row_number: row.row_number,
    name: row.name.trim(),
    salt: row.salt.trim(),
    category,
    bup_category: bup,
    manufacturer: row.manufacturer.trim(),
    reorder_level: row.reorder_level.trim()
      ? Number(row.reorder_level)
      : DEFAULT_REORDER_LEVEL,
    tablets_per_strip: row.tablets_per_strip.trim()
      ? Number(row.tablets_per_strip)
      : DEFAULT_TABLETS_PER_STRIP,
    mrp: Number(row.mrp).toFixed(2),
    selling_price: Number(row.selling_price).toFixed(2),
  };
}

/**
 * Detect duplicate (name + category + bup_category) combinations *within* the
 * uploaded file. Returns a map of row_number → the earliest row_number it
 * duplicates, so the grid can flag later occurrences. Matching mirrors the
 * backend uniqueness key (case-insensitive on name for a friendlier UX).
 */
export function findInFileDuplicates(
  rows: MedicineCsvRow[],
): Map<number, number> {
  const firstSeen = new Map<string, number>();
  const dupes = new Map<number, number>();
  for (const row of rows) {
    if (!row.name.trim() || !row.category.trim()) continue;
    const key = [
      row.name.trim().toLowerCase(),
      row.category.trim().toLowerCase(),
      row.bup_category.trim().toLowerCase(),
    ].join(" ");
    const existing = firstSeen.get(key);
    if (existing !== undefined) {
      dupes.set(row.row_number, existing);
    } else {
      firstSeen.set(key, row.row_number);
    }
  }
  return dupes;
}
